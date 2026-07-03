// ============================================================
// Faltas, folgas e atestados
// ============================================================

const NOMES_AUSENCIA = { FALTA: "Falta", FOLGA: "Folga", ATESTADO: "Atestado", OUTRO: "Outro" };

const NOMES_DIA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

async function carregarAusencias() {
  const tbody = document.getElementById("tbody-ausencias");

  const { data, error } = await supabaseClient
    .from("ausencias")
    .select("*, colaboradores(nome)")
    .order("data", { ascending: false })
    .limit(100);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="texto-suave">Erro: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="texto-suave">Nenhuma ausência lançada.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(a => `
    <tr>
      <td>${a.colaboradores?.nome || "—"}</td>
      <td>${new Date(a.data + "T00:00:00").toLocaleDateString("pt-BR")}</td>
      <td><span class="badge ${a.tipo === "FALTA" ? "badge--alerta" : "badge--mei"}">${NOMES_AUSENCIA[a.tipo]}</span></td>
      <td class="texto-pequeno">${a.motivo || "—"}</td>
      <td><div class="acoes-linha"><button data-acao="excluir-ausencia" data-id="${a.id}">Excluir</button></div></td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-acao='excluir-ausencia']").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este lançamento?")) return;
      await supabaseClient.from("ausencias").delete().eq("id", btn.getAttribute("data-id"));
      carregarAusencias();
    });
  });
}

document.getElementById("btn-nova-ausencia").addEventListener("click", () => {
  const modais = document.getElementById("camada-modais");
  modais.innerHTML = `
    <div class="modal-fundo" id="modal-ausencia-fundo">
      <div class="card modal-form">
        <h3>Lançar ausência</h3>
        <div class="stack mt-16">
          <div>
            <label class="bsk-label">Colaborador</label>
            <select id="fa-colaborador" class="input">
              <option value="">Selecione...</option>
              ${colaboradoresCache.map(c => `<option value="${c.id}" data-vinculo="${c.vinculo}" data-dias='${JSON.stringify(c.dias_trabalho || [])}'>${c.nome}</option>`).join("")}
            </select>
          </div>

          <div id="bloco-folgas-mes" style="display:none;">
            <label class="bsk-label">Lançar folgas do mês inteiro</label>
            <div class="row">
              <input type="month" id="fa-mes-folgas" class="input flex-1">
              <button type="button" class="btn btn--secundario" id="btn-lancar-mes">Lançar mês</button>
            </div>
            <p class="texto-suave texto-pequeno mt-4" id="hint-dias-folga"></p>
          </div>

          <div>
            <label class="bsk-label">Data</label>
            <input type="date" id="fa-data" class="input">
            <p class="texto-pequeno mt-4" id="hint-folga-auto" style="color:var(--bsk-amarelo);display:none;"></p>
          </div>
          <div>
            <label class="bsk-label">Tipo</label>
            <select id="fa-tipo" class="input">
              <option value="FALTA">Falta</option>
              <option value="FOLGA">Folga</option>
              <option value="ATESTADO">Atestado</option>
              <option value="OUTRO">Outro</option>
            </select>
          </div>
          <div>
            <label class="bsk-label">Motivo (opcional)</label>
            <input type="text" id="fa-motivo" class="input">
          </div>
          <p class="texto-pequeno" id="erro-ausencia" style="color:#e57373;"></p>
          <div class="row mt-8">
            <button type="button" class="btn btn--secundario flex-1" id="btn-cancelar-ausencia">Cancelar</button>
            <button type="button" class="btn btn--primario flex-1" id="btn-salvar-ausencia">Lançar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-cancelar-ausencia").addEventListener("click", () => modais.innerHTML = "");
  document.getElementById("modal-ausencia-fundo").addEventListener("click", e => {
    if (e.target.id === "modal-ausencia-fundo") modais.innerHTML = "";
  });

  // Ao trocar colaborador: se for CLT, mostra opções de folga automática
  document.getElementById("fa-colaborador").addEventListener("change", function () {
    const opt = this.options[this.selectedIndex];
    const vinculo = opt.getAttribute("data-vinculo");
    const diasTrabalho = JSON.parse(opt.getAttribute("data-dias") || "[]");
    const blocoMes = document.getElementById("bloco-folgas-mes");
    const hint = document.getElementById("hint-dias-folga");

    if (vinculo === "CLT" && diasTrabalho.length > 0) {
      blocoMes.style.display = "";
      const diasFolga = [0,1,2,3,4,5,6].filter(d => !diasTrabalho.includes(d));
      hint.textContent = `Dias de folga: ${diasFolga.map(d => NOMES_DIA[d]).join(", ")}`;
      verificarDiaFolga();
    } else {
      blocoMes.style.display = "none";
    }
  });

  // Ao escolher uma data: detecta automaticamente se é dia de folga
  document.getElementById("fa-data").addEventListener("change", verificarDiaFolga);

  function verificarDiaFolga() {
    const opt = document.getElementById("fa-colaborador").options[document.getElementById("fa-colaborador").selectedIndex];
    const diasTrabalho = JSON.parse(opt.getAttribute("data-dias") || "[]");
    const dataVal = document.getElementById("fa-data").value;
    const hint = document.getElementById("hint-folga-auto");
    const selectTipo = document.getElementById("fa-tipo");

    if (!dataVal || diasTrabalho.length === 0) { hint.style.display = "none"; return; }

    // getDay() de uma data YYYY-MM-DD via T12:00 evita problema de timezone
    const diaSemana = new Date(dataVal + "T12:00:00").getDay();
    const eFolga = !diasTrabalho.includes(diaSemana);

    if (eFolga) {
      selectTipo.value = "FOLGA";
      hint.textContent = `${NOMES_DIA[diaSemana]} é folga deste colaborador — tipo alterado para Folga.`;
      hint.style.display = "";
    } else {
      selectTipo.value = "FALTA";
      hint.style.display = "none";
    }
  }

  // Lançar todas as folgas de um mês
  document.getElementById("btn-lancar-mes").addEventListener("click", async () => {
    const opt = document.getElementById("fa-colaborador").options[document.getElementById("fa-colaborador").selectedIndex];
    const colaboradorId = document.getElementById("fa-colaborador").value;
    const diasTrabalho = JSON.parse(opt.getAttribute("data-dias") || "[]");
    const mesVal = document.getElementById("fa-mes-folgas").value;
    const erroEl = document.getElementById("erro-ausencia");

    if (!colaboradorId) { erroEl.textContent = "Selecione o colaborador primeiro."; return; }
    if (!mesVal) { erroEl.textContent = "Escolha o mês."; return; }

    const [ano, mes] = mesVal.split("-").map(Number);
    const diasFolga = [];
    const totalDias = new Date(ano, mes, 0).getDate();

    for (let d = 1; d <= totalDias; d++) {
      const diaSemana = new Date(ano, mes - 1, d).getDay();
      if (!diasTrabalho.includes(diaSemana)) {
        diasFolga.push(`${ano}-${String(mes).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
      }
    }

    if (diasFolga.length === 0) { erroEl.textContent = "Nenhum dia de folga encontrado para este mês."; return; }

    if (!confirm(`Lançar ${diasFolga.length} folgas para ${opt.text} em ${mesVal.split("-").reverse().join("/")}?`)) return;

    const registros = diasFolga.map(data => ({
      colaborador_id: colaboradorId,
      data,
      tipo: "FOLGA",
      motivo: "Folga semanal",
      lancado_por: perfilLogado.id
    }));

    const { error } = await supabaseClient.from("ausencias").insert(registros);
    if (error) { erroEl.textContent = "Erro: " + error.message; return; }

    modais.innerHTML = "";
    carregarAusencias();
  });

  // Salvar ausência individual
  document.getElementById("btn-salvar-ausencia").addEventListener("click", async () => {
    const colaboradorId = document.getElementById("fa-colaborador").value;
    const data = document.getElementById("fa-data").value;
    const tipo = document.getElementById("fa-tipo").value;
    const motivo = document.getElementById("fa-motivo").value || null;
    const erroEl = document.getElementById("erro-ausencia");

    if (!colaboradorId) { erroEl.textContent = "Selecione um colaborador."; return; }
    if (!data) { erroEl.textContent = "Informe a data."; return; }

    const { error } = await supabaseClient.from("ausencias").insert({
      colaborador_id: colaboradorId,
      data,
      tipo,
      motivo,
      lancado_por: perfilLogado.id
    });
    if (error) { erroEl.textContent = "Erro: " + error.message; return; }
    modais.innerHTML = "";
    carregarAusencias();
  });
});

document.addEventListener("bsk:perfil-carregado", carregarAusencias);

