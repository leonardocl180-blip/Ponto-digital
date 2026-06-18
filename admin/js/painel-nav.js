// ============================================================
// Navegação entre seções do painel (sem reload de página)
// ============================================================

const sidebarPainel = document.getElementById("painel-sidebar");
const backdropPainel = document.getElementById("painel-backdrop");
const btnMenuMobile = document.getElementById("btn-menu-mobile");

function abrirMenuMobile() {
  sidebarPainel.classList.add("painel-sidebar--aberta");
  backdropPainel.classList.add("painel-backdrop--visivel");
}
function fecharMenuMobile() {
  sidebarPainel.classList.remove("painel-sidebar--aberta");
  backdropPainel.classList.remove("painel-backdrop--visivel");
}

btnMenuMobile?.addEventListener("click", () => {
  sidebarPainel.classList.contains("painel-sidebar--aberta") ? fecharMenuMobile() : abrirMenuMobile();
});
backdropPainel?.addEventListener("click", fecharMenuMobile);

document.querySelectorAll(".nav-item[data-secao]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("nav-item--ativo"));
    btn.classList.add("nav-item--ativo");

    document.querySelectorAll(".painel-secao").forEach(s => s.classList.remove("painel-secao--ativa"));
    document.getElementById(btn.getAttribute("data-secao")).classList.add("painel-secao--ativa");

    fecharMenuMobile();
  });
});
