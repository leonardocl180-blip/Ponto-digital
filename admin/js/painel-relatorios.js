// ============================================================
// Relatórios PDF — formato econômico para impressão:
// preto e branco, sem preenchimento de cor, linhas finas.
// Usa jsPDF + jspdf-autotable (carregados via CDN no painel.html)
// ============================================================

const { jsPDF } = window.jspdf;

// ------------------------------------------------------------
// Atualiza as opções de período (CLT = mensal fixo / MEI = semanal ou quinzenal)
// quando o colaborador selecionado muda.
// ------------------------------------------------------------
document.getElementById("select-colaborador-relatorio").addEventListener("change", atualizarOpcoesPeriodo);

async function atualizarOpcoesPeriodo() {
  const id = document.getElementById("select-colaborador-relatorio").value;
  const colaborador = colaboradoresCache.find(c => c.id === id);
  const container = document.getElementById("opcoes-periodo-relatorio");

  if (!colaborador) { container.innerHTML = ""; return; }

  if (colaborador.vinculo === "CLT") {
    const hoje = new Date();
    container.innerHTML = `
      <div class="flex-1">
        <label class="bsk-label">Mês de referência</label>
        <input type="month" id="mes-referencia-clt" class="input"
          value="${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}">
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="flex-1">
        <label class="bsk-label">Período</label>
        <select id="periodo-mei" class="input">
          <option value="SEMANAL">Semanal (seg. a dom.)</option>
          <option value="QUINZENAL" selected>Quinzenal</option>
        </select>
      </div>
      <div class="flex-1">
        <label class="bsk-label">Data de referência</label>
        <input type="date" id="data-referencia-mei" class="input" value="${new Date().toISOString().slice(0,10)}">
      </div>
    `;

    // Usa o período já configurado para este colaborador (aba Colaboradores),
    // em vez de sempre cair no padrão "Quinzenal".
    const { data } = await supabaseClient
      .from("config_relatorio_mei")
      .select("periodo")
      .eq("colaborador_id", id)
      .maybeSingle();

    if (data?.periodo) {
      const selPeriodo = document.getElementById("periodo-mei");
      if (selPeriodo) selPeriodo.value = data.periodo;
    }
  }
}

// ------------------------------------------------------------
// Calcula início/fim do período MEI (semanal seg-dom, ou quinzenal)
// ------------------------------------------------------------
function calcularPeriodoMei(dataRefStr, periodo) {
  const dataRef = new Date(dataRefStr + "T00:00:00");
  const diaSemana = dataRef.getDay(); // 0=domingo

  if (periodo === "SEMANAL") {
    const diffParaSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
    const inicio = new Date(dataRef);
    inicio.setDate(dataRef.getDate() + diffParaSegunda);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 6);
    return { inicio, fim };
  } else {
    // Quinzenal: dia 1-15 ou 16-fim do mês
    const ano = dataRef.getFullYear();
    const mes = dataRef.getMonth();
    if (dataRef.getDate() <= 15) {
      return { inicio: new Date(ano, mes, 1), fim: new Date(ano, mes, 15) };
    } else {
      const ultimoDia = new Date(ano, mes + 1, 0).getDate();
      return { inicio: new Date(ano, mes, 16), fim: new Date(ano, mes, ultimoDia) };
    }
  }
}

function formatarDataBR(d) {
  return d.toLocaleDateString("pt-BR");
}

// Converte um timestamp ISO (UTC) para a data no fuso de Brasília (UTC-3).
// Ex.: "2026-06-19T02:30:00Z" → "2026-06-18" (22:30 BRT ainda era dia 18)
function dataBRT(isoStr) {
  return new Date(new Date(isoStr).getTime() - 3 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
}

function gerarListaDias(inicio, fim) {
  const dias = [];
  const cursor = new Date(inicio);
  while (cursor <= fim) {
    dias.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

function diffHorasMinutos(dataHoraInicio, dataHoraFim) {
  const ms = dataHoraFim - dataHoraInicio;
  if (ms <= 0) return 0;
  return ms / (1000 * 60 * 60);
}

function formatarHoras(horasDecimal) {
  const sinal = horasDecimal < 0 ? "-" : "";
  const abs = Math.abs(horasDecimal);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${sinal}${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

// ------------------------------------------------------------
// Cabeçalho padrão do PDF (preto e branco)
// ------------------------------------------------------------
function desenharCabecalho(doc, titulo, colaborador, periodoTexto) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Black Skull Bier", 14, 16);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(titulo, 14, 22);

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(14, 25, 196, 25);

  doc.setFontSize(9);
  let y = 32;
  if (colaborador) {
    doc.text(`Colaborador: ${colaborador.nome}`, 14, y); y += 5;
    doc.text(`Cargo: ${colaborador.cargo || "-"}`, 14, y); y += 5;
    doc.text(`Vínculo: ${colaborador.vinculo}`, 14, y); y += 5;
  }
  doc.text(`Período: ${periodoTexto}`, 14, y); y += 7;

  return y;
}

function desenharRodapeAssinatura(doc, y) {
  let yFinal = y + 20;
  if (yFinal > 280) yFinal = 280;
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  doc.line(14, yFinal, 90, yFinal);
  doc.line(120, yFinal, 196, yFinal);
  doc.setFontSize(8);
  doc.text("Assinatura do colaborador", 14, yFinal + 4);
  doc.text("Assinatura do responsável", 120, yFinal + 4);
}

// ------------------------------------------------------------
// PDF — Relatório individual CLT (mensal)
// ------------------------------------------------------------
async function gerarPdfClt(colaborador, anoMes) {
  const [ano, mes] = anoMes.split("-").map(Number);
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0);

  // Busca até o dia seguinte ao fim do mês para capturar saídas após meia-noite BRT
  const fimQuery = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() + 1, 5, 59, 59);

  const { data: registros } = await supabaseClient
    .from("registros_ponto")
    .select("*")
    .eq("colaborador_id", colaborador.id)
    .gte("data_hora", inicio.toISOString())
    .lte("data_hora", fimQuery.toISOString())
    .order("data_hora");

  const { data: ausencias } = await supabaseClient
    .from("ausencias")
    .select("*")
    .eq("colaborador_id", colaborador.id)
    .gte("data", inicio.toISOString().slice(0,10))
    .lte("data", fim.toISOString().slice(0,10));

  const dias = gerarListaDias(inicio, fim);
  const linhas = [];
  let totalHoras = 0, totalExtra = 0, totalFaltas = 0;

  const jornadaEsperada = (() => {
    if (!colaborador.horario_entrada || !colaborador.horario_saida) return 8;
    const [eh, em] = colaborador.horario_entrada.split(":").map(Number);
    const [sh, sm] = colaborador.horario_saida.split(":").map(Number);
    let totalMin = (sh*60+sm) - (eh*60+em);
    if (colaborador.horario_saida_almoco && colaborador.horario_volta_almoco) {
      const [sah, sam] = colaborador.horario_saida_almoco.split(":").map(Number);
      const [vah, vam] = colaborador.horario_volta_almoco.split(":").map(Number);
      totalMin -= (vah*60+vam) - (sah*60+sam);
    }
    return totalMin / 60;
  })();

  // Ordena todos os registros cronologicamente para encontrar pares entrada→saída
  const todosOrdenados = [...(registros || [])].sort((a,b) => new Date(a.data_hora) - new Date(b.data_hora));

  for (const dia of dias) {
    const diaStr = `${dia.getFullYear()}-${String(dia.getMonth()+1).padStart(2,"0")}-${String(dia.getDate()).padStart(2,"0")}`;
    const diaSemana = dia.getDay();
    const trabalhaEsteDia = (colaborador.dias_trabalho || [1,2,3,4,5]).includes(diaSemana);
    const ausenciaDoDia = ausencias?.find(a => a.data === diaStr);

    // Detecta tipo de batida pelo que está gravado naquele dia (não pelo
    // config atual). Compatível com histórico gravado em modo diferente.
    const entradasSimples = todosOrdenados.filter(r => r.tipo === "ENTRADA"       && dataBRT(r.data_hora) === diaStr);
    const entradasLivre   = todosOrdenados.filter(r => r.tipo === "ENTRADA_LIVRE" && dataBRT(r.data_hora) === diaStr);
    // Restringe SAIDA_ALMOCO/VOLTA_ALMOCO ao mesmo dia (evita vazar para dias seguintes)
    const saidasAlmocoDia = todosOrdenados.filter(r => r.tipo === "SAIDA_ALMOCO"  && dataBRT(r.data_hora) === diaStr);
    const voltasAlmocoDia = todosOrdenados.filter(r => r.tipo === "VOLTA_ALMOCO"  && dataBRT(r.data_hora) === diaStr);

    let horasNoDia = 0;
    let entradaRef = null, saidaRef = null, saidaAlmocoRef = null, voltaAlmocoRef = null;

    if (entradasSimples.length > 0) {
      // Formato CLT clássico: ENTRADA / SAIDA_ALMOCO / VOLTA_ALMOCO / SAIDA
      entradaRef     = entradasSimples[0];
      saidaAlmocoRef = saidasAlmocoDia[0] || null;
      voltaAlmocoRef = voltasAlmocoDia[0] || null;
      saidaRef       = todosOrdenados.find(r =>
        r.tipo === "SAIDA" && dataBRT(r.data_hora) === diaStr &&
        new Date(r.data_hora) > new Date(entradaRef.data_hora)
      ) || null;
      if (entradaRef && saidaRef) {
        horasNoDia = diffHorasMinutos(new Date(entradaRef.data_hora), new Date(saidaRef.data_hora));
        if (saidaAlmocoRef && voltaAlmocoRef)
          horasNoDia -= diffHorasMinutos(new Date(saidaAlmocoRef.data_hora), new Date(voltaAlmocoRef.data_hora));
      }

    } else if (entradasLivre.length > 0) {
      // Formato LIVRE: pares ENTRADA_LIVRE → SAIDA_LIVRE
      // Lógica de pareamento: antes de buscar a saída de uma entrada,
      // verifica se existe OUTRA entrada depois. Se sim, a saída válida
      // deve estar entre as duas entradas — isso resolve naturalmente
      // virada de meia-noite E evita pegar saídas de dias seguintes.
      const saidasUsadas = [];
      const turnos = [];
      for (const ent of entradasLivre) {
        const entMs = new Date(ent.data_hora).getTime();
        // Próxima entrada (em qualquer dia) após esta
        const proxEntrada = todosOrdenados.find(r =>
          (r.tipo === "ENTRADA_LIVRE" || r.tipo === "ENTRADA") &&
          new Date(r.data_hora).getTime() > entMs &&
          r.id !== ent.id
        );
        // Limite = próxima entrada OU 24h, o que vier primeiro
        const limiteMs = Math.min(
          proxEntrada ? new Date(proxEntrada.data_hora).getTime() : Infinity,
          entMs + 24 * 3600000
        );

        const s = todosOrdenados.find(r =>
          r.tipo === "SAIDA_LIVRE" &&
          new Date(r.data_hora).getTime() > entMs &&
          new Date(r.data_hora).getTime() < limiteMs &&
          !saidasUsadas.includes(r.id)
        );
        if (s) { saidasUsadas.push(s.id); turnos.push({ entrada: ent, saida: s }); horasNoDia += diffHorasMinutos(new Date(ent.data_hora), new Date(s.data_hora)); }
        else    { turnos.push({ entrada: ent, saida: null }); }
      }

      entradaRef = entradasLivre[0];

      if (turnos.length >= 2 && turnos[0].saida) {
        // 2+ turnos: preenche colunas CLT (saída int. / volta int. / saída final)
        saidaAlmocoRef = turnos[0].saida;
        voltaAlmocoRef = turnos[1].entrada;
        saidaRef = turnos[turnos.length - 1].saida; // null se saída final ausente
      } else {
        saidaRef = turnos[0]?.saida || null;
      }
    }

    const temRegistro = entradaRef !== null;

    let extraOuAtraso = 0;
    let observacao = "";

    if (ausenciaDoDia) {
      observacao = ausenciaDoDia.tipo === "FALTA" ? "Falta" :
                    ausenciaDoDia.tipo === "FOLGA" ? "Folga" :
                    ausenciaDoDia.tipo === "ATESTADO" ? "Atestado" : (ausenciaDoDia.motivo || "Outro");
      if (ausenciaDoDia.tipo === "FALTA") totalFaltas++;
    } else if (!trabalhaEsteDia) {
      observacao = "—";
    } else if (temRegistro) {
      // "Saída incompleta" se qualquer turno do dia ficou sem saída
      if (turnos && turnos.some(t => !t.saida) && horasNoDia > 0) {
        observacao = "Saída incompleta";
      }
      extraOuAtraso = horasNoDia - jornadaEsperada;
      // Tolerância de 5 minutos na volta do intervalo: déficit ≤ 5 min é zerado
      if (extraOuAtraso < 0 && extraOuAtraso >= -5 / 60) extraOuAtraso = 0;
      totalHoras += horasNoDia;
      totalExtra += extraOuAtraso;
    } else {
      observacao = "Sem registro";
    }

    linhas.push([
      formatarDataBR(dia),
      entradaRef    ? new Date(entradaRef.data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-",
      saidaAlmocoRef? new Date(saidaAlmocoRef.data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-",
      voltaAlmocoRef? new Date(voltaAlmocoRef.data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-",
      saidaRef      ? new Date(saidaRef.data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-",
      (temRegistro && horasNoDia > 0) ? formatarHoras(horasNoDia) : "-",
      (temRegistro && horasNoDia > 0) ? formatarHoras(extraOuAtraso) : "-",
      observacao
    ]);
  }

  const doc = new jsPDF();
  const periodoTexto = `${inicio.toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}`;
  let y = desenharCabecalho(doc, "Folha de ponto mensal — CLT", colaborador, periodoTexto);

  doc.autoTable({
    startY: y,
    head: [["Data","Entrada","Saída almoço","Volta almoço","Saída","Total","Extra/Atraso","Obs."]],
    body: linhas,
    theme: "plain",
    styles: { fontSize: 7.5, textColor: 0, lineColor: 0, lineWidth: 0.1 },
    headStyles: { fontStyle: "bold", lineWidth: 0.2 },
    tableLineColor: 0,
    tableLineWidth: 0.1,
  });

  let yFinal = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Totais do período", 14, yFinal); yFinal += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Horas trabalhadas: ${formatarHoras(totalHoras)}`, 14, yFinal); yFinal += 5;
  doc.text(`Saldo de horas extras/atrasos: ${formatarHoras(totalExtra)}`, 14, yFinal); yFinal += 5;
  doc.text(`Faltas: ${totalFaltas}`, 14, yFinal);

  desenharRodapeAssinatura(doc, yFinal);

  doc.save(`folha-ponto-${colaborador.nome.replace(/\s+/g,"-")}-${anoMes}.pdf`);
}

// ------------------------------------------------------------
// PDF — Relatório individual MEI (semanal/quinzenal, horas puras)
// ------------------------------------------------------------
async function gerarPdfMei(colaborador, periodo, dataRefStr) {
  const { inicio, fim } = calcularPeriodoMei(dataRefStr, periodo);
  const fimQuery = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() + 1, 5, 59, 59);

  const [{ data: registros }, { data: configMei }] = await Promise.all([
    supabaseClient
      .from("registros_ponto")
      .select("*")
      .eq("colaborador_id", colaborador.id)
      .gte("data_hora", inicio.toISOString())
      .lte("data_hora", fimQuery.toISOString())
      .order("data_hora"),
    supabaseClient
      .from("config_relatorio_mei")
      .select("valor_hora")
      .eq("colaborador_id", colaborador.id)
      .maybeSingle()
  ]);

  const valorHora = configMei?.valor_hora ?? null;

  const dias = gerarListaDias(inicio, fim);
  const linhas = [];
  let totalHoras = 0;
  let totalIntervaloMinutos = 0;

  const todosOrdenadosMei = [...(registros || [])].sort((a,b) => new Date(a.data_hora) - new Date(b.data_hora));

  for (const dia of dias) {
    const diaStr = `${dia.getFullYear()}-${String(dia.getMonth()+1).padStart(2,"0")}-${String(dia.getDate()).padStart(2,"0")}`;

    // Todas as entradas cujo dia BRT coincide com hoje
    const entradas = todosOrdenadosMei.filter(r =>
      (r.tipo === "ENTRADA_LIVRE" || r.tipo === "ENTRADA") && dataBRT(r.data_hora) === diaStr
    );

    // Pareia cada entrada com a primeira saída seguinte (pode cruzar
    // meia-noite BRT). Monta a lista de turnos do dia — o colaborador
    // MEI pode ter nenhum, um ou vários turnos/intervalos no mesmo dia.
    let horasNoDia = 0;
    const turnos = [];
    const saidasUsadas = [];
    for (const ent of entradas) {
      const saida = todosOrdenadosMei.find(r =>
        (r.tipo === "SAIDA_LIVRE" || r.tipo === "SAIDA") &&
        new Date(r.data_hora) > new Date(ent.data_hora) &&
        !saidasUsadas.includes(r.id)
      );
      if (saida) {
        horasNoDia += diffHorasMinutos(new Date(ent.data_hora), new Date(saida.data_hora));
        saidasUsadas.push(saida.id);
        turnos.push({ entrada: ent, saida });
      } else {
        turnos.push({ entrada: ent, saida: null }); // bateu entrada mas ainda não saiu
      }
    }
    totalHoras += horasNoDia;

    // Intervalos = gaps entre o fim de um turno e o início do próximo.
    // Se houver só 1 turno (ou 0), não existe intervalo nesse dia.
    const intervalosTexto = [];
    for (let i = 0; i < turnos.length - 1; i++) {
      if (turnos[i].saida) {
        const gapMin = (new Date(turnos[i+1].entrada.data_hora) - new Date(turnos[i].saida.data_hora)) / 60000;
        if (gapMin > 0) {
          totalIntervaloMinutos += gapMin;
          intervalosTexto.push(formatarHoras(gapMin / 60));
        }
      }
    }

    if (turnos.length === 0) {
      linhas.push([formatarDataBR(dia), "-", "—", "-"]);
    } else {
      const turnosTexto = turnos.map(t => {
        const he = new Date(t.entrada.data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
        const hs = t.saida ? new Date(t.saida.data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "(em aberto)";
        return `${he} – ${hs}`;
      }).join("\n");

      linhas.push([
        formatarDataBR(dia),
        turnosTexto,
        intervalosTexto.length > 0 ? intervalosTexto.join("\n") : "—",
        horasNoDia > 0 ? formatarHoras(horasNoDia) : "-"
      ]);
    }
  }

  const doc = new jsPDF();
  const periodoTexto = `${formatarDataBR(inicio)} a ${formatarDataBR(fim)} (${periodo === "SEMANAL" ? "semanal" : "quinzenal"})`;
  let y = desenharCabecalho(doc, "Relatório de horas — MEI", colaborador, periodoTexto);

  doc.autoTable({
    startY: y,
    head: [["Data","Turnos (entrada – saída)","Intervalos","Total horas"]],
    body: linhas,
    theme: "plain",
    styles: { fontSize: 8, textColor: 0, lineColor: 0, lineWidth: 0.1, valign: "top" },
    headStyles: { fontStyle: "bold", lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 60 },
      2: { cellWidth: 30 },
      3: { cellWidth: 26 }
    },
    tableLineColor: 0,
    tableLineWidth: 0.1,
  });

  let yFinal = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Total do período", 14, yFinal); yFinal += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Total de horas trabalhadas: ${formatarHoras(totalHoras)}`, 14, yFinal); yFinal += 5;
  doc.text(`Total em intervalos: ${totalIntervaloMinutos > 0 ? formatarHoras(totalIntervaloMinutos / 60) : "nenhum intervalo no período"}`, 14, yFinal); yFinal += 5;

  if (valorHora != null) {
    const totalMinutos = Math.round(totalHoras * 60);
    const valorTotal = (totalMinutos / 60) * valorHora;
    doc.text(`Valor/hora: R$ ${valorHora.toFixed(2).replace(".", ",")}`, 14, yFinal); yFinal += 5;
    doc.setFont("helvetica", "bold");
    doc.text(`Valor total: R$ ${valorTotal.toFixed(2).replace(".", ",")}`, 14, yFinal);
    doc.setFont("helvetica", "normal");
  }

  desenharRodapeAssinatura(doc, yFinal);

  doc.save(`horas-${colaborador.nome.replace(/\s+/g,"-")}-${dataRefStr}.pdf`);
}

document.getElementById("btn-gerar-pdf-individual").addEventListener("click", async () => {
  const id = document.getElementById("select-colaborador-relatorio").value;
  const colaborador = colaboradoresCache.find(c => c.id === id);
  if (!colaborador) { alert("Selecione um colaborador."); return; }

  if (colaborador.vinculo === "CLT") {
    const anoMes = document.getElementById("mes-referencia-clt").value;
    if (!anoMes) { alert("Selecione o mês."); return; }
    await gerarPdfClt(colaborador, anoMes);
  } else {
    const periodo = document.getElementById("periodo-mei").value;
    const dataRef = document.getElementById("data-referencia-mei").value;
    if (!dataRef) { alert("Selecione a data de referência."); return; }
    await gerarPdfMei(colaborador, periodo, dataRef);
  }
});

// ------------------------------------------------------------
// PDF — Resumo geral (todos os colaboradores)
// ------------------------------------------------------------
document.getElementById("btn-gerar-pdf-resumo").addEventListener("click", async () => {
  const dataInicio = document.getElementById("data-inicio-resumo").value;
  const dataFim = document.getElementById("data-fim-resumo").value;
  if (!dataInicio || !dataFim) { alert("Selecione o período."); return; }

  const linhas = [];

  for (const colaborador of colaboradoresCache) {
    const { data: registros } = await supabaseClient
      .from("registros_ponto")
      .select("*")
      .eq("colaborador_id", colaborador.id)
      .gte("data_hora", dataInicio + "T00:00:00")
      .lte("data_hora", dataFim + "T23:59:59")
      .order("data_hora");

    const { data: ausencias } = await supabaseClient
      .from("ausencias")
      .select("*")
      .eq("colaborador_id", colaborador.id)
      .eq("tipo", "FALTA")
      .gte("data", dataInicio)
      .lte("data", dataFim);

    // Agrupa por dia e soma horas (funciona tanto para pares ENTRADA/SAIDA quanto livres)
    const porDia = {};
    (registros || []).forEach(r => {
      const dia = r.data_hora.slice(0,10);
      porDia[dia] = porDia[dia] || [];
      porDia[dia].push(r);
    });

    let totalHoras = 0;
    Object.values(porDia).forEach(regsDoDia => {
      const entradas = regsDoDia.filter(r => r.tipo.startsWith("ENTRADA"));
      const saidas = regsDoDia.filter(r => r.tipo.startsWith("SAIDA") && !r.tipo.includes("ALMOCO"));
      const saidaAlmoco = regsDoDia.find(r => r.tipo === "SAIDA_ALMOCO");
      const voltaAlmoco = regsDoDia.find(r => r.tipo === "VOLTA_ALMOCO");

      const n = Math.min(entradas.length, saidas.length);
      for (let i = 0; i < n; i++) {
        let h = diffHorasMinutos(new Date(entradas[i].data_hora), new Date(saidas[i].data_hora));
        if (saidaAlmoco && voltaAlmoco) {
          h -= diffHorasMinutos(new Date(saidaAlmoco.data_hora), new Date(voltaAlmoco.data_hora));
        }
        totalHoras += h;
      }
    });

    linhas.push([
      colaborador.nome,
      colaborador.vinculo,
      formatarHoras(totalHoras),
      ausencias?.length || 0
    ]);
  }

  const doc = new jsPDF();
  let y = desenharCabecalho(doc, "Resumo geral de ponto", null,
    `${formatarDataBR(new Date(dataInicio+"T00:00:00"))} a ${formatarDataBR(new Date(dataFim+"T00:00:00"))}`);

  doc.autoTable({
    startY: y,
    head: [["Colaborador","Vínculo","Total de horas","Faltas"]],
    body: linhas,
    theme: "plain",
    styles: { fontSize: 9, textColor: 0, lineColor: 0, lineWidth: 0.1 },
    headStyles: { fontStyle: "bold", lineWidth: 0.2 },
    tableLineColor: 0,
    tableLineWidth: 0.1,
  });

  doc.save(`resumo-geral-${dataInicio}-a-${dataFim}.pdf`);
});
