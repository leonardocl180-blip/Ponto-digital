// ============================================================
// Login administrativo (Master / Gestor)
// ============================================================

const formLogin = document.getElementById("form-login");
const msgErro = document.getElementById("msg-erro");
const btnEntrar = document.getElementById("btn-entrar");

// Se já estiver logado, manda direto pro painel
(async () => {
  const { data } = await supabaseClient.auth.getSession();
  if (data?.session) {
    window.location.href = "painel.html";
  }
})();

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgErro.textContent = "";
  btnEntrar.disabled = true;
  btnEntrar.textContent = "Entrando...";

  const email = document.getElementById("input-email").value.trim();
  const senha = document.getElementById("input-senha").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });

  if (error) {
    msgErro.textContent = "E-mail ou senha incorretos.";
    btnEntrar.disabled = false;
    btnEntrar.textContent = "Entrar";
    return;
  }

  window.location.href = "painel.html";
});
