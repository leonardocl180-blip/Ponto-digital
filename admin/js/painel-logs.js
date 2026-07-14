// ============================================================
// Logs de alterações de registros de ponto
// ============================================================

const LABEL_ACAO = {
  ADICIONAR_REGISTRO: "Adicionou registro",
  EDITAR_REGISTRO:    "Editou registro",
  EXCLUIR_REGISTRO:   "Excluiu registro",
};

async function carregarLogs() {
  const tbody = document.getElementById("tbody-logs");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="texto-suave">Carregando...</td></tr>`;

  const { data, error } = await supabaseClient
    .from("logs_alteracoes")
    .select("*, perfis(nome), colaboradores(nome)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="texto-suave">Erro: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="texto-suave">Nenhum log registrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(l => `
    <tr>
      <td class="texto-pequeno">${new Date(l.created_at).toLocaleString("pt-BR")}</td>
      <td>${l.perfis?.nome || "—"}</td>
      <td>${l.colaboradores?.nome || "—"}</td>
      <td><span class="badge badge--mei texto-pequeno">${LABEL_ACAO[l.acao] || l.acao}</span></td>
      <td class="texto-pequeno">${l.observacao || "—"}</td>
      <td>
        <button class="btn btn--secundario texto-pequeno" style="padding:4px 8px;"
          onclick="verDetalhesLog('${l.id}')">Detalhes</button>
      </td>
    </tr>
  `).join("");

  // Cache for detail view
  window._logsCache = data;
}

function verDetalhesLog(id) {
  const log = window._logsCache?.find(l => l.id === id);
  if (!log) return;

  const fmt = obj => obj ? `<pre style="white-space:pre-wrap;font-size:11px;">${JSON.stringify(obj, null, 2)}</pre>` : "—";

  const modais = document.getElementById("camada-modais");
  modais.innerHTML = `
    <div class="modal-fundo" id="modal-log-detalhe">
      <div class="card modal-form" style="max-width:500px;">
        <h3>Detalhes do log</h3>
        <div class="stack mt-12" style="font-size:13px;">
          <div><strong>Gestor:</strong> ${log.perfis?.nome || "—"}</div>
          <div><strong>Colaborador:</strong> ${log.colaboradores?.nome || "—"}</div>
          <div><strong>Ação:</strong> ${LABEL_ACAO[log.acao] || log.acao}</div>
          <div><strong>Data/hora:</strong> ${new Date(log.created_at).toLocaleString("pt-BR")}</div>
          <div><strong>Observação:</strong> ${log.observacao || "—"}</div>
          <div><strong>Dados anteriores:</strong>${fmt(log.dados_anteriores)}</div>
          <div><strong>Dados novos:</strong>${fmt(log.dados_novos)}</div>
        </div>
        <button class="btn btn--primario btn--bloco mt-16" onclick="document.getElementById('camada-modais').innerHTML=''">Fechar</button>
      </div>
    </div>
  `;
}

document.addEventListener("bsk:perfil-carregado", carregarLogs);
