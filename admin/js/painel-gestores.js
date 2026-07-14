// ============================================================
// Gestão de Gestores — visível apenas para o Master.
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

  tbody.innerHTML = data.filter(p => p.id !== perfilLogado?.id).map(p => `
    <tr>
      <td>${p.nome}</td>
      <td class="texto-suave texto-pequeno" id="email-${p.id}">—</td>
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
      if (!confirm("Remover o acesso deste usuário ao painel? O login continuará existindo no Supabase Auth.")) return;
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
        <div class="stack mt-16">
          <div>
            <label class="bsk-label">Nome</label>
            <input type="text" id="fp-nome" class="input" value="${nomeAtual}">
          </div>
          <div>
            <label class="bsk-label">Tipo de acesso</label>
            <select id="fp-tipo" class="input">
              <option value="GESTOR" ${tipoAtual === "GESTOR" ? "selected" : ""}>Gestor</option>
              <option value="MASTER" ${tipoAtual === "MASTER" ? "selected" : ""}>Master</option>
            </select>
          </div>
          <p id="erro-perfil" class="texto-pequeno" style="color:#e57373;"></p>
          <div class="row mt-8">
            <button type="button" class="btn btn--secundario flex-1" id="btn-cancelar-perfil">Cancelar</button>
            <button type="button" class="btn btn--primario flex-1" id="btn-salvar-perfil">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-cancelar-perfil").addEventListener("click", () => modais.innerHTML = "");
  document.getElementById("btn-salvar-perfil").addEventListener("click", async () => {
    const { error } = await supabaseClient.from("perfis").update({
      nome: document.getElementById("fp-nome").value.trim(),
      tipo: document.getElementById("fp-tipo").value
    }).eq("id", id);
    if (error) { document.getElementById("erro-perfil").textContent = "Erro: " + error.message; return; }
    modais.innerHTML = "";
    carregarGestores();
  });
}

document.getElementById("btn-novo-gestor")?.addEventListener("click", () => {
  const modais = document.getElementById("camada-modais");
  modais.innerHTML = `
    <div class="modal-fundo" id="modal-novo-gestor-fundo">
      <div class="card modal-form">
        <h3>Novo gestor</h3>
        <p class="texto-suave texto-pequeno mt-8">
          O gestor receberá acesso imediato com as credenciais abaixo.
        </p>
        <div class="stack mt-16">
          <div>
            <label class="bsk-label">Nome completo</label>
            <input type="text" id="ng-nome" class="input" placeholder="Ex: João Silva">
          </div>
          <div>
            <label class="bsk-label">E-mail</label>
            <input type="email" id="ng-email" class="input" placeholder="joao@empresa.com">
          </div>
          <div>
            <label class="bsk-label">Senha inicial</label>
            <div class="row">
              <input type="text" id="ng-senha" class="input flex-1" placeholder="Mín. 6 caracteres">
              <button type="button" class="btn btn--secundario" id="btn-gerar-senha" style="white-space:nowrap;">Gerar</button>
            </div>
            <p class="texto-suave texto-pequeno mt-4">Anote esta senha — o gestor poderá alterá-la depois.</p>
          </div>
          <div>
            <label class="bsk-label">Tipo de acesso</label>
            <select id="ng-tipo" class="input">
              <option value="GESTOR">Gestor</option>
              <option value="MASTER">Master</option>
            </select>
          </div>
          <p id="erro-novo-gestor" class="texto-pequeno" style="color:#e57373;"></p>
          <div class="row mt-8">
            <button type="button" class="btn btn--secundario flex-1" id="btn-cancelar-ng">Cancelar</button>
            <button type="button" class="btn btn--primario flex-1" id="btn-criar-gestor">Criar acesso</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-cancelar-ng").addEventListener("click", () => modais.innerHTML = "");
  document.getElementById("modal-novo-gestor-fundo").addEventListener("click", e => {
    if (e.target.id === "modal-novo-gestor-fundo") modais.innerHTML = "";
  });

  // Gera uma senha aleatória de 10 caracteres
  document.getElementById("btn-gerar-senha").addEventListener("click", () => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!";
    const senha = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    document.getElementById("ng-senha").value = senha;
  });

  document.getElementById("btn-criar-gestor").addEventListener("click", async () => {
    const nome  = document.getElementById("ng-nome").value.trim();
    const email = document.getElementById("ng-email").value.trim();
    const senha = document.getElementById("ng-senha").value;
    const tipo  = document.getElementById("ng-tipo").value;
    const erroEl = document.getElementById("erro-novo-gestor");

    if (!nome)  { erroEl.textContent = "Informe o nome."; return; }
    if (!email) { erroEl.textContent = "Informe o e-mail."; return; }
    if (senha.length < 6) { erroEl.textContent = "A senha precisa ter pelo menos 6 caracteres."; return; }

    erroEl.textContent = "";
    document.getElementById("btn-criar-gestor").textContent = "Criando...";
    document.getElementById("btn-criar-gestor").disabled = true;

    // Chama a função RPC que cria o usuário Auth + perfil com security definer
    const { data, error } = await supabaseClient.rpc("criar_gestor", {
      p_email: email,
      p_nome: nome,
      p_tipo: tipo,
      p_senha: senha
    });

    if (error) {
      erroEl.textContent = error.message.includes("Já existe")
        ? "Este e-mail já está cadastrado."
        : "Erro: " + error.message;
      document.getElementById("btn-criar-gestor").textContent = "Criar acesso";
      document.getElementById("btn-criar-gestor").disabled = false;
      return;
    }

    // Sucesso — mostra as credenciais para o Master anotar
    modais.innerHTML = `
      <div class="modal-fundo">
        <div class="card modal-form" style="text-align:center;">
          <h3>✅ Acesso criado!</h3>
          <p class="texto-suave texto-pequeno mt-8">Passe estas credenciais para o gestor:</p>
          <div style="background:var(--bsk-cinza-card);border-radius:var(--raio-medio);padding:16px;margin-top:16px;text-align:left;">
            <p class="texto-pequeno"><strong>E-mail:</strong> ${email}</p>
            <p class="texto-pequeno mt-8"><strong>Senha:</strong> <code style="color:var(--bsk-amarelo)">${senha}</code></p>
            <p class="texto-pequeno mt-8"><strong>Tipo:</strong> ${tipo}</p>
          </div>
          <p class="texto-suave texto-pequeno mt-12">O gestor pode alterar a senha em Configurações após o primeiro login.</p>
          <button class="btn btn--primario btn--bloco mt-16" id="btn-fechar-ng">Entendido</button>
        </div>
      </div>
    `;
    document.getElementById("btn-fechar-ng").addEventListener("click", () => {
      modais.innerHTML = "";
      carregarGestores();
    });
  });
});

document.addEventListener("bsk:perfil-carregado", (e) => {
  if (e.detail.tipo === "MASTER") carregarGestores();
});
