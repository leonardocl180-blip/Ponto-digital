// ============================================================
// Verifica login e carrega dados do perfil (Master/Gestor)
// Compartilhado por todas as telas do painel.
// ============================================================

let perfilLogado = null; // { id, nome, tipo }

async function verificarAutenticacaoEcarregarPerfil() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData?.session) {
    window.location.href = "login.html";
    return null;
  }

  const userId = sessionData.session.user.id;
  const { data: perfil, error } = await supabaseClient
    .from("perfis")
    .select("id, nome, tipo")
    .eq("id", userId)
    .single();

  if (error || !perfil) {
    console.error("Erro ao carregar perfil:", error);
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
    return null;
  }

  perfilLogado = perfil;

  document.getElementById("texto-perfil-logado").textContent =
    `${perfil.nome} · ${perfil.tipo === "MASTER" ? "Master" : "Gestor"}`;

  if (perfil.tipo === "MASTER") {
    document.getElementById("nav-gestores").style.display = "flex";
  }

  document.dispatchEvent(new CustomEvent("bsk:perfil-carregado", { detail: perfil }));
  return perfil;
}

document.getElementById("btn-sair").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
});

verificarAutenticacaoEcarregarPerfil();
