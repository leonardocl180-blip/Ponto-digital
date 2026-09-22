// ============================================================
// Feriados manuais (estaduais, municipais, pontos facultativos)
// Os feriados nacionais são calculados automaticamente no PDF.
// Estes são carregados pelo relatório e adicionados ao cálculo
// de hora extra especial (100%).
// ============================================================

async function carregarFeriados() {
  const tbody = document.getElementById("tbody-feriados");
  if (!tbody) return;

  const { data, error } = await supabaseClient
    .from("feriados_manuais")
    .select("*")
    .order("data");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="texto-suave">Erro: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="texto-suave">Nenhum feriado cadastrado além dos nacionais.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(f => `
    <tr>
      <td>${new Date(f.data + "T00:00:00").toLocaleDateString("pt-BR")}</td>
      <td>${f.nome}</td>
      <td class="texto-pequeno texto-suave">${f.tipo || "Municipal/Estadual"}</td>
      <td>
        <div class="acoes-linha">
          <button data-acao="excluir-feriado" data-id="${f.id}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-acao='excluir-feriado']").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este feriado?")) return;
      await supabaseClient.from("feriados_manuais").delete().eq("id", btn.getAttribute("data-id"));
      carregarFeriados();
    });
  });
}

document.getElementById("btn-novo-feriado")?.addEventListener("click", () => {
  const modais = document.getElementById("camada-modais");
  modais.innerHTML = `
    <div class="modal-fundo" id="modal-feriado-fundo">
      <div class="card modal-form">
        <h3>Adicionar feriado</h3>
        <div class="stack mt-16">
          <div>
            <label class="bsk-label">Data</label>
            <input type="date" id="ff-data" class="input">
          </div>
          <div>
            <label class="bsk-label">Nome do feriado</label>
            <input type="text" id="ff-nome" class="input" placeholder="Ex: Aniversário da cidade">
          </div>
          <div>
            <label class="bsk-label">Tipo</label>
            <select id="ff-tipo" class="input">
              <option value="Municipal/Estadual">Municipal / Estadual</option>
              <option value="Ponto facultativo">Ponto facultativo</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          <p id="ff-erro" class="texto-pequeno" style="color:#e57373;"></p>
          <div class="row mt-8">
            <button type="button" class="btn btn--secundario flex-1" id="btn-cancelar-feriado">Cancelar</button>
            <button type="button" class="btn btn--primario flex-1" id="btn-salvar-feriado">Adicionar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-cancelar-feriado").addEventListener("click", () => modais.innerHTML = "");
  document.getElementById("modal-feriado-fundo").addEventListener("click", e => {
    if (e.target.id === "modal-feriado-fundo") modais.innerHTML = "";
  });

  document.getElementById("btn-salvar-feriado").addEventListener("click", async () => {
    const data  = document.getElementById("ff-data").value;
    const nome  = document.getElementById("ff-nome").value.trim();
    const tipo  = document.getElementById("ff-tipo").value;
    const erroEl = document.getElementById("ff-erro");

    if (!data) { erroEl.textContent = "Informe a data."; return; }
    if (!nome) { erroEl.textContent = "Informe o nome do feriado."; return; }

    const { error } = await supabaseClient.from("feriados_manuais").insert({ data, nome, tipo });
    if (error) { erroEl.textContent = "Erro: " + error.message; return; }

    modais.innerHTML = "";
    carregarFeriados();
  });
});

document.addEventListener("bsk:perfil-carregado", carregarFeriados);
