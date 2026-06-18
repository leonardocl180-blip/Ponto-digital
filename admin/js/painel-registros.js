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
        <td class="texto-pequeno texto-suave">${r.origem === "OFFLINE_SYNC" ? "Sincronizado (offline)" : "Online"}</td>
        <td>
          <div class="acoes-linha">
            <button data-acao="editar-registro" data-id="${r.id}" data-datahora="${r.data_hora}">Editar</button>
            <button data-acao="excluir-registro" data-id="${r.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-acao='editar-registro']").forEach(btn => {
    btn.addEventListener("click", () => editarRegistro(btn.getAttribute("data-id"), btn.getAttribute("data-datahora")));
  });
  tbody.querySelectorAll("[data-acao='excluir-registro']").forEach(btn => {
    btn.addEventListener("click", () => excluirRegistro(btn.getAttribute("data-id")));
  });
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
