// ============================================================
// Navegação entre seções do painel (sem reload de página)
// ============================================================

document.querySelectorAll(".nav-item[data-secao]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("nav-item--ativo"));
    btn.classList.add("nav-item--ativo");

    document.querySelectorAll(".painel-secao").forEach(s => s.classList.remove("painel-secao--ativa"));
    document.getElementById(btn.getAttribute("data-secao")).classList.add("painel-secao--ativa");
  });
});
