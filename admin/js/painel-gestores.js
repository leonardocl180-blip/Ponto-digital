// ============================================================
// Gestão de Gestores — visível apenas para o Master.
// IMPORTANTE: criar um novo usuário de login (Auth) a partir do
// front-end requer a Service Role Key, que NUNCA deve ficar no
// código público do GitHub Pages. Por isso, a criação de novos
// logins (Master/Gestor) é feita manualmente no Dashboard do
// Supabase (ver README.md) — aqui o Master apenas EDITA o nome/
// tipo de um perfil já existente, ou remove o acesso.
// ============================================================

async function carregarGestores() {
  const tbody = document.getElementById("tbody-gestores");
  if (!tbody) return;

  const { data, error } = await supabaseClient
    .from("perfis")
    .select("id, nome, tipo")
    .order("nome");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="texto-suave">Erro: ${error.message}</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(p => `
    <tr>
      <td>${p.nome}</td>
      <td class="texto-suave texto-pequeno">ID: ${p.id.slice(0,8)}...</td>
      <td><span class="badge ${p.tipo === "MASTER" ? "badge--mei" : "badge--clt"}">${p.tipo}</span></td>
      <td>
        <div class="acoes-linha">
          <button data-acao="editar-perfil" data-id="${p.id}" data-nome="${p.nome}" data-tipo="${p.tipo}">Editar</button>
          ${p.id !== perfilLogado.id ? `<button data-acao="remover-perfil" data-id="${p.id}">Remover</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-acao='editar-perfil']").forEach(btn => {
    btn.addEventListener("click", () => editarPerfil(btn.getAttribute("data-id"), btn.getAttribute("data-nome"), btn.getAttribute("data-tipo")));
  });
  tbody.querySelectorAll("[data-acao='remover-perfil']").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remover o acesso deste usuário ao painel? O login continuará existindo no Supabase Auth, mas perderá as permissões.")) return;
      await supabaseClient.from("perfis").delete().eq("id", btn.getAttribute("data-id"));
      carregarGestores();
    });
  });
}

function editarPerfil(id, nomeAtual, tipoAtual) {
  const modais = document.getElementById("camada-modais");
  modais.innerHTML = `
    <div class="modal-fundo" id="modal-perfil-fundo">
      <div class="card modal-form">
        <h3>Editar acesso</h3>
        <form id="form-perfil" class="stack mt-16">
          <div>
            <label class="bsk-label">Nome</label>
            <input type="text" id="fp-nome" class="input" value="${nomeAtual}" required>
          </div>
          <div>
            <label class="bsk-label">Tipo de acesso</label>
            <select id="fp-tipo" class="input">
              <option value="GESTOR" ${tipoAtual === "GESTOR" ? "selected" : ""}>Gestor</option>
              <option value="MASTER" ${tipoAtual === "MASTER" ? "selected" : ""}>Master</option>
            </select>
          </div>
          <div class="row mt-8">
            <button type="button" class="btn btn--secundario flex-1" id="btn-cancelar-perfil">Cancelar</button>
            <button type="submit" class="btn btn--primario flex-1">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById("btn-cancelar-perfil").addEventListener("click", () => modais.innerHTML = "");

  document.getElementById("form-perfil").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await supabaseClient.from("perfis").update({
      nome: document.getElementById("fp-nome").value.trim(),
      tipo: document.getElementById("fp-tipo").value
    }).eq("id", id);

    if (error) { alert("Erro: " + error.message); return; }
    modais.innerHTML = "";
    carregarGestores();
  });
}

document.getElementById("btn-novo-gestor")?.addEventListener("click", () => {
  alert(
    "Para criar um novo login de Gestor ou Master, crie o usuário no Dashboard do Supabase " +
    "(Authentication > Users > Add user) e depois adicione uma linha na tabela 'perfis' com o " +
    "mesmo ID. Veja o passo a passo completo no README.md do projeto."
  );
});

document.addEventListener("bsk:perfil-carregado", (e) => {
  if (e.detail.tipo === "MASTER") carregarGestores();
});
