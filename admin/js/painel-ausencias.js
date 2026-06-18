// ============================================================
// Faltas, folgas e atestados
// ============================================================

const NOMES_AUSENCIA = { FALTA: "Falta", FOLGA: "Folga", ATESTADO: "Atestado", OUTRO: "Outro" };

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
        <form id="form-ausencia" class="stack mt-16">
          <div>
            <label class="bsk-label">Colaborador</label>
            <select id="fa-colaborador" class="input" required>
              <option value="">Selecione...</option>
              ${colaboradoresCache.map(c => `<option value="${c.id}">${c.nome}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="bsk-label">Data</label>
            <input type="date" id="fa-data" class="input" required>
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
          <div class="row mt-8">
            <button type="button" class="btn btn--secundario flex-1" id="btn-cancelar-ausencia">Cancelar</button>
            <button type="submit" class="btn btn--primario flex-1">Lançar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById("btn-cancelar-ausencia").addEventListener("click", () => modais.innerHTML = "");

  document.getElementById("form-ausencia").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await supabaseClient.from("ausencias").insert({
      colaborador_id: document.getElementById("fa-colaborador").value,
      data: document.getElementById("fa-data").value,
      tipo: document.getElementById("fa-tipo").value,
      motivo: document.getElementById("fa-motivo").value || null,
      lancado_por: perfilLogado.id
    });
    if (error) { alert("Erro: " + error.message); return; }
    modais.innerHTML = "";
    carregarAusencias();
  });
});

document.addEventListener("bsk:perfil-carregado", carregarAusencias);
