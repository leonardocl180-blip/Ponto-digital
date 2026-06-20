// ============================================================
// Registros de ponto: listagem por colaborador + edição manual
// pelo administrador (Master/Gestor), conforme definido.
// ============================================================

const NOMES_BATIDA = {
  ENTRADA: "Entrada", SAIDA_ALMOCO: "Saída almoço", VOLTA_ALMOCO: "Volta almoço",
  SAIDA: "Saída", ENTRADA_LIVRE: "Entrada", SAIDA_LIVRE: "Saída"
};

let colaboradoresCache = [];

window.addEventListener("bsk:colaboradores-atualizados", (e) => {
  colaboradoresCache = e.detail;
  preencherSelectColaboradores("select-colaborador-registros");
  preencherSelectColaboradores("select-colaborador-relatorio");
});

function preencherSelectColaboradores(idSelect) {
  const select = document.getElementById(idSelect);
  if (!select) return;
  const valorAtual = select.value;
  select.innerHTML = `<option value="">Selecione...</option>` +
    colaboradoresCache.map(c => `<option value="${c.id}">${c.nome} (${c.vinculo})</option>`).join("");
  if (valorAtual) select.value = valorAtual;
}

document.getElementById("select-colaborador-registros").addEventListener("change", carregarRegistros);
document.getElementById("btn-filtrar-registros").addEventListener("click", carregarRegistros);

async function carregarRegistros() {
  const colaboradorId = document.getElementById("select-colaborador-registros").value;
  const tbody = document.getElementById("tbody-registros");

  if (!colaboradorId) {
    tbody.innerHTML = `<tr><td colspan="5" class="texto-suave">Selecione um colaborador.</td></tr>`;
    return;
  }

  let query = supabaseClient
    .from("registros_ponto")
    .select("*")
    .eq("colaborador_id", colaboradorId)
    .order("data_hora", { ascending: false })
    .limit(200);

  const dataInicio = document.getElementById("data-inicio-registros").value;
  const dataFim = document.getElementById("data-fim-registros").value;
  if (dataInicio) query = query.gte("data_hora", dataInicio + "T00:00:00");
  if (dataFim) query = query.lte("data_hora", dataFim + "T23:59:59");

  const { data, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="texto-suave">Erro: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="texto-suave">Nenhum registro encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => {
    const dt = new Date(r.data_hora);
    return `
      <tr>
        <td>${dt.toLocaleDateString("pt-BR")}</td>
        <td>${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
        <td>${NOMES_BATIDA[r.tipo] || r.tipo}</td>
        <td class="texto-pequeno texto-suave">${
          r.origem === "OFFLINE_SYNC" ? "Sincronizado (offline)" :
          r.origem === "MANUAL_ADMIN" ? "Adicionado manualmente" :
          "Online"
        }</td>
        <td>
          <div class="acoes-linha">
            ${r.foto_url ? `<button data-acao="ver-foto" data-url="${r.foto_url}">Foto</button>` : ""}
            <button data-acao="editar-registro" data-id="${r.id}" data-datahora="${r.data_hora}">Editar</button>
            <button data-acao="excluir-registro" data-id="${r.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-acao='ver-foto']").forEach(btn => {
    btn.addEventListener("click", () => abrirFotoRegistro(btn.getAttribute("data-url")));
  });
  tbody.querySelectorAll("[data-acao='editar-registro']").forEach(btn => {
    btn.addEventListener("click", () => editarRegistro(btn.getAttribute("data-id"), btn.getAttribute("data-datahora")));
  });
  tbody.querySelectorAll("[data-acao='excluir-registro']").forEach(btn => {
    btn.addEventListener("click", () => excluirRegistro(btn.getAttribute("data-id")));
  });
}

function abrirFotoRegistro(url) {
  const modais = document.getElementById("camada-modais");
  modais.innerHTML = `
    <div class="modal-fundo" id="modal-foto-fundo">
      <div class="card modal-form" style="text-align:center;">
        <h3>Foto da batida</h3>
        <img src="${url}" alt="Foto registrada na batida de ponto" style="max-width:100%; border-radius: var(--raio-medio); margin-top:16px;">
        <button type="button" class="btn btn--secundario btn--bloco mt-16" id="btn-fechar-foto">Fechar</button>
      </div>
    </div>
  `;
  document.getElementById("btn-fechar-foto").addEventListener("click", () => modais.innerHTML = "");
  document.getElementById("modal-foto-fundo").addEventListener("click", (e) => {
    if (e.target.id === "modal-foto-fundo") modais.innerHTML = "";
  });
}

document.getElementById("btn-novo-registro").addEventListener("click", abrirNovoRegistro);

function abrirNovoRegistro() {
  const modais = document.getElementById("camada-modais");
  const agora = new Date();
  const dataHoraLocal = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);

  modais.innerHTML = `
    <div class="modal-fundo" id="modal-novo-registro-fundo">
      <div class="card modal-form">
        <h3>Adicionar registro manual</h3>
        <p class="texto-suave texto-pequeno mt-8">
          Use isto quando o colaborador esquecer de bater o ponto, ou para corrigir uma falta de registro.
        </p>
        <div class="stack mt-16">
          <div>
            <label class="bsk-label">Colaborador</label>
            <select id="f-novo-reg-colaborador" class="input">
              <option value="">Selecione...</option>
              ${colaboradoresCache.map(c => `<option value="${c.id}">${c.nome} (${c.vinculo})</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="bsk-label">Tipo de registro</label>
            <select id="f-novo-reg-tipo" class="input">
              <option value="ENTRADA">Entrada</option>
              <option value="SAIDA_ALMOCO">Início do intervalo</option>
              <option value="VOLTA_ALMOCO">Fim do intervalo</option>
              <option value="SAIDA">Saída</option>
              <option value="ENTRADA_LIVRE">Entrada (MEI)</option>
              <option value="SAIDA_LIVRE">Saída (MEI)</option>
            </select>
          </div>
          <div>
            <label class="bsk-label">Data e hora</label>
            <input type="datetime-local" id="f-novo-reg-datahora" class="input" value="${dataHoraLocal}">
          </div>
        </div>
        <p class="texto-pequeno mt-8" id="erro-novo-registro" style="color:#e57373;"></p>
        <div class="row mt-16">
          <button type="button" class="btn btn--secundario" id="btn-cancelar-novo-registro">Cancelar</button>
          <button type="button" class="btn btn--primario" id="btn-salvar-novo-registro">Adicionar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-cancelar-novo-registro").addEventListener("click", () => modais.innerHTML = "");
  document.getElementById("modal-novo-registro-fundo").addEventListener("click", (e) => {
    if (e.target.id === "modal-novo-registro-fundo") modais.innerHTML = "";
  });
  document.getElementById("btn-salvar-novo-registro").addEventListener("click", salvarNovoRegistro);

  // Se já houver um colaborador selecionado no filtro, pré-seleciona
  const colaboradorFiltro = document.getElementById("select-colaborador-registros").value;
  if (colaboradorFiltro) document.getElementById("f-novo-reg-colaborador").value = colaboradorFiltro;
}

async function salvarNovoRegistro() {
  const colaboradorId = document.getElementById("f-novo-reg-colaborador").value;
  const tipo = document.getElementById("f-novo-reg-tipo").value;
  const dataHora = document.getElementById("f-novo-reg-datahora").value;
  const erroEl = document.getElementById("erro-novo-registro");

  if (!colaboradorId) { erroEl.textContent = "Selecione um colaborador."; return; }
  if (!dataHora) { erroEl.textContent = "Informe a data e hora."; return; }

  const { error } = await supabaseClient.from("registros_ponto").insert({
    colaborador_id: colaboradorId,
    tipo,
    data_hora: new Date(dataHora).toISOString(),
    origem: "MANUAL_ADMIN",
    editado_por: perfilLogado.id
  });

  if (error) { erroEl.textContent = "Erro ao adicionar: " + error.message; return; }

  document.getElementById("camada-modais").innerHTML = "";
  if (document.getElementById("select-colaborador-registros").value === colaboradorId) {
    carregarRegistros();
  }
}

async function editarRegistro(id, dataHoraAtual) {
  const dt = new Date(dataHoraAtual);
  const dataLocal = dt.toISOString().slice(0, 16); // formato datetime-local

  const novoValor = prompt("Nova data/hora (AAAA-MM-DDTHH:MM):", dataLocal);
  if (!novoValor) return;

  const { error } = await supabaseClient
    .from("registros_ponto")
    .update({ data_hora: new Date(novoValor).toISOString(), editado_por: perfilLogado.id })
    .eq("id", id);

  if (error) { alert("Erro ao editar: " + error.message); return; }
  carregarRegistros();
}

async function excluirRegistro(id) {
  if (!confirm("Excluir este registro de ponto?")) return;
  const { error } = await supabaseClient.from("registros_ponto").delete().eq("id", id);
  if (error) { alert("Erro: " + error.message); return; }
  carregarRegistros();
}
