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

  const { data: registros } = await supabaseClient
    .from("registros_ponto")
    .select("*")
    .eq("colaborador_id", colaborador.id)
    .gte("data_hora", inicio.toISOString())
    .lte("data_hora", new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59).toISOString())
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

  for (const dia of dias) {
    const diaStr = dia.toISOString().slice(0,10);
    const diaSemana = dia.getDay();
    const trabalhaEsteDia = (colaborador.dias_trabalho || [1,2,3,4,5]).includes(diaSemana);

    const ausenciaDoDia = ausencias?.find(a => a.data === diaStr);
    const registrosDoDia = (registros || []).filter(r => r.data_hora.slice(0,10) === diaStr);

    const pegar = (tipo) => registrosDoDia.find(r => r.tipo === tipo);
    const entrada = pegar("ENTRADA");
    const saidaAlmoco = pegar("SAIDA_ALMOCO");
    const voltaAlmoco = pegar("VOLTA_ALMOCO");
    const saida = pegar("SAIDA");

    let horasNoDia = 0;
    if (entrada && saida) {
      horasNoDia = diffHorasMinutos(new Date(entrada.data_hora), new Date(saida.data_hora));
      if (saidaAlmoco && voltaAlmoco) {
        horasNoDia -= diffHorasMinutos(new Date(saidaAlmoco.data_hora), new Date(voltaAlmoco.data_hora));
      }
    }

    let extraOuAtraso = 0;
    let observacao = "";

    if (ausenciaDoDia) {
      observacao = ausenciaDoDia.tipo === "FALTA" ? "Falta" :
                    ausenciaDoDia.tipo === "FOLGA" ? "Folga" :
                    ausenciaDoDia.tipo === "ATESTADO" ? "Atestado" : (ausenciaDoDia.motivo || "Outro");
      if (ausenciaDoDia.tipo === "FALTA") totalFaltas++;
    } else if (!trabalhaEsteDia) {
      observacao = "—";
    } else if (entrada || saida) {
      extraOuAtraso = horasNoDia - jornadaEsperada;
      totalHoras += horasNoDia;
      totalExtra += extraOuAtraso;
    } else {
      observacao = "Sem registro";
    }

    linhas.push([
      formatarDataBR(dia),
      entrada ? new Date(entrada.data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-",
      saidaAlmoco ? new Date(saidaAlmoco.data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-",
      voltaAlmoco ? new Date(voltaAlmoco.data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-",
      saida ? new Date(saida.data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-",
      (entrada && saida) ? formatarHoras(horasNoDia) : "-",
      (entrada && saida) ? formatarHoras(extraOuAtraso) : "-",
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

  const { data: registros } = await supabaseClient
    .from("registros_ponto")
    .select("*")
    .eq("colaborador_id", colaborador.id)
    .gte("data_hora", inicio.toISOString())
    .lte("data_hora", new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59).toISOString())
    .order("data_hora");

  const dias = gerarListaDias(inicio, fim);
  const linhas = [];
  let totalHoras = 0;

  for (const dia of dias) {
    const diaStr = dia.toISOString().slice(0,10);
    const registrosDoDia = (registros || []).filter(r => r.data_hora.slice(0,10) === diaStr);

    // Modo livre: pode ter múltiplos pares entrada/saída no dia
    const entradas = registrosDoDia.filter(r => r.tipo === "ENTRADA_LIVRE" || r.tipo === "ENTRADA");
    const saidas = registrosDoDia.filter(r => r.tipo === "SAIDA_LIVRE" || r.tipo === "SAIDA");

    let horasNoDia = 0;
    const n = Math.min(entradas.length, saidas.length);
    for (let i = 0; i < n; i++) {
      horasNoDia += diffHorasMinutos(new Date(entradas[i].data_hora), new Date(saidas[i].data_hora));
    }
    totalHoras += horasNoDia;

    if (registrosDoDia.length === 0) {
      linhas.push([formatarDataBR(dia), "-", "-", "-", "—"]);
    } else {
      const horaEntrada = entradas[0] ? new Date(entradas[0].data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-";
      const horaSaida = saidas[saidas.length-1] ? new Date(saidas[saidas.length-1].data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-";
      linhas.push([
        formatarDataBR(dia),
        horaEntrada,
        horaSaida,
        formatarHoras(horasNoDia),
        entradas.length > 1 ? `${entradas.length} turnos` : "-"
      ]);
    }
  }

  const doc = new jsPDF();
  const periodoTexto = `${formatarDataBR(inicio)} a ${formatarDataBR(fim)} (${periodo === "SEMANAL" ? "semanal" : "quinzenal"})`;
  let y = desenharCabecalho(doc, "Relatório de horas — MEI", colaborador, periodoTexto);

  doc.autoTable({
    startY: y,
    head: [["Data","Entrada","Saída","Total horas","Obs."]],
    body: linhas,
    theme: "plain",
    styles: { fontSize: 8, textColor: 0, lineColor: 0, lineWidth: 0.1 },
    headStyles: { fontStyle: "bold", lineWidth: 0.2 },
    tableLineColor: 0,
    tableLineWidth: 0.1,
  });

  let yFinal = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Total do período", 14, yFinal); yFinal += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Total de horas: ${formatarHoras(totalHoras)}`, 14, yFinal);

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
