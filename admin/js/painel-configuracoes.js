// ============================================================
// Configurações do sistema — visível apenas para Master
// ============================================================

async function carregarConfiguracoes() {
  const { data } = await supabaseClient
    .from("config_sistema").select("*").single();
  if (!data) return;
  document.getElementById("cfg-foto-dias").value    = data.foto_retention_days;
  document.getElementById("cfg-reg-dias").value     = data.registro_retention_days;
  document.getElementById("cfg-log-dias").value     = data.log_retention_days;
}

document.getElementById("btn-salvar-config")?.addEventListener("click", async () => {
  const msgEl = document.getElementById("msg-config");
  msgEl.textContent = "Salvando...";
  msgEl.style.color = "#aaa";

  const payload = {
    foto_retention_days:    parseInt(document.getElementById("cfg-foto-dias").value) || 60,
    registro_retention_days:parseInt(document.getElementById("cfg-reg-dias").value)  || 365,
    log_retention_days:     parseInt(document.getElementById("cfg-log-dias").value)  || 180,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseClient
    .from("config_sistema").update(payload).eq("id", 1);

  if (error) {
    msgEl.textContent = "Erro ao salvar: " + error.message;
    msgEl.style.color = "#e57373";
  } else {
    msgEl.textContent = "✓ Configurações salvas.";
    msgEl.style.color = "#4caf50";
  }
});

document.getElementById("btn-limpar-agora")?.addEventListener("click", async () => {
  if (!confirm("Executar limpeza agora? Isso excluirá dados além do prazo configurado permanentemente.")) return;

  const msgEl = document.getElementById("msg-config");
  msgEl.textContent = "Executando limpeza...";
  msgEl.style.color = "#aaa";

  const [fotos, registros, logs] = await Promise.all([
    supabaseClient.rpc("limpar_fotos_antigas"),
    supabaseClient.rpc("limpar_registros_antigos"),
    supabaseClient.rpc("limpar_logs_antigos"),
  ]);

  const erros = [fotos, registros, logs].filter(r => r.error).map(r => r.error.message);
  if (erros.length) {
    msgEl.textContent = "Erro: " + erros.join("; ");
    msgEl.style.color = "#e57373";
  } else {
    msgEl.textContent =
      `✓ Limpeza concluída: ${fotos.data} foto(s) removida(s), ` +
      `${registros.data} registro(s) excluído(s), ${logs.data} log(s) excluído(s).`;
    msgEl.style.color = "#4caf50";
  }
});

document.addEventListener("bsk:perfil-carregado", (e) => {
  if (e.detail.tipo === "MASTER") carregarConfiguracoes();
});
