// ============================================================
// Gestão de colaboradores (CRUD)
// Master vê todos. Gestor vê/edita só os da própria equipe
// (RLS no banco já garante isso — aqui só exibimos o que vier).
// ============================================================

const DIAS_SEMANA = [
  { valor: 0, label: "Dom" }, { valor: 1, label: "Seg" }, { valor: 2, label: "Ter" },
  { valor: 3, label: "Qua" }, { valor: 4, label: "Qui" }, { valor: 5, label: "Sex" },
  { valor: 6, label: "Sáb" }
];

async function carregarColaboradoresPainel() {
  const { data, error } = await supabaseClient
    .from("colaboradores")
    .select("*")
    .order("nome");

  const tbody = document.getElementById("tbody-colaboradores");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="texto-suave">Erro ao carregar: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="texto-suave">Nenhum colaborador cadastrado ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(c => `
    <tr>
      <td>${c.nome}</td>
      <td>${c.cargo || "—"}</td>
      <td><span class="badge ${c.vinculo === "CLT" ? "badge--clt" : "badge--mei"}">${c.vinculo}</span></td>
      <td>${c.tipo_registro === "SIMPLES" ? "Entrada/Saída" : "Múltiplas batidas"}</td>
      <td class="texto-pequeno">${formatarJornadaResumo(c)}</td>
      <td>
        <div class="acoes-linha">
          <button data-acao="editar" data-id="${c.id}">Editar</button>
          <button data-acao="excluir" data-id="${c.id}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-acao='editar']").forEach(btn => {
    btn.addEventListener("click", () => abrirModalColaborador(data.find(c => c.id === btn.getAttribute("data-id"))));
  });
  tbody.querySelectorAll("[data-acao='excluir']").forEach(btn => {
    btn.addEventListener("click", () => excluirColaborador(btn.getAttribute("data-id")));
  });

  // Atualiza os selects de outras seções (registros/relatórios)
  window.dispatchEvent(new CustomEvent("bsk:colaboradores-atualizados", { detail: data }));
}

function formatarJornadaResumo(c) {
  if (c.vinculo === "MEI") return "Horas puras";
  if (!c.horario_entrada) return "—";
  return `${c.horario_entrada?.slice(0,5)} – ${c.horario_saida?.slice(0,5) || "?"}`;
}

document.getElementById("btn-novo-colaborador").addEventListener("click", () => abrirModalColaborador(null));

function abrirModalColaborador(colaborador) {
  const ehEdicao = !!colaborador;
  const c = colaborador || {
    nome: "", cargo: "", pin: "", vinculo: "CLT", tipo_registro: "SIMPLES",
    horario_entrada: "08:00", horario_saida_almoco: "12:00",
    horario_volta_almoco: "13:00", horario_saida: "17:00",
    dias_trabalho: [1,2,3,4,5]
  };

  const modais = document.getElementById("camada-modais");
  modais.innerHTML = `
    <div class="modal-fundo" id="modal-colab-fundo">
      <div class="card modal-form">
        <h3>${ehEdicao ? "Editar colaborador" : "Novo colaborador"}</h3>
        <form id="form-colaborador" class="stack mt-16">
          <div>
            <label class="bsk-label">Nome completo</label>
            <input type="text" id="f-nome" class="input" value="${c.nome}" required>
          </div>
          <div>
            <label class="bsk-label">Cargo</label>
            <input type="text" id="f-cargo" class="input" value="${c.cargo || ""}">
          </div>
          <div>
            <label class="bsk-label">PIN (4 dígitos, usado no quiosque)</label>
            <input type="text" id="f-pin" class="input" value="${c.pin || ""}" pattern="[0-9]{4}" maxlength="4" required>
          </div>
          <div class="row">
            <div class="flex-1">
              <label class="bsk-label">Vínculo</label>
              <select id="f-vinculo" class="input">
                <option value="CLT" ${c.vinculo === "CLT" ? "selected" : ""}>CLT (jornada fixa)</option>
                <option value="MEI" ${c.vinculo === "MEI" ? "selected" : ""}>MEI (horas puras)</option>
              </select>
            </div>
            <div class="flex-1">
              <label class="bsk-label">Tipo de registro</label>
              <select id="f-tipo-registro" class="input">
                <option value="SIMPLES" ${c.tipo_registro === "SIMPLES" ? "selected" : ""}>Entrada/Saída</option>
                <option value="LIVRE" ${c.tipo_registro === "LIVRE" ? "selected" : ""}>Múltiplas batidas</option>
              </select>
            </div>
          </div>

          <div id="bloco-campos-clt" class="${c.vinculo === "CLT" ? "campos-clt--visivel" : ""} campos-clt">
            <label class="bsk-label">Jornada fixa</label>
            <div class="row">
              <input type="time" id="f-entrada" class="input" value="${c.horario_entrada?.slice(0,5) || ""}">
              <input type="time" id="f-saida-almoco" class="input" value="${c.horario_saida_almoco?.slice(0,5) || ""}">
            </div>
            <div class="row mt-8">
              <input type="time" id="f-volta-almoco" class="input" value="${c.horario_volta_almoco?.slice(0,5) || ""}">
              <input type="time" id="f-saida" class="input" value="${c.horario_saida?.slice(0,5) || ""}">
            </div>
            <label class="bsk-label mt-16">Dias de trabalho</label>
            <div class="checkbox-dias" id="checkbox-dias">
              ${DIAS_SEMANA.map(d => `
                <label>
                  <input type="checkbox" value="${d.valor}" ${(c.dias_trabalho || []).includes(d.valor) ? "checked" : ""}>
                  ${d.label}
                </label>
              `).join("")}
            </div>
          </div>

          <div id="msg-erro-colab" class="texto-pequeno" style="color: var(--bsk-vermelho); min-height: 18px;"></div>

          <div class="row mt-8">
            <button type="button" class="btn btn--secundario flex-1" id="btn-cancelar-colab">Cancelar</button>
            <button type="submit" class="btn btn--primario flex-1">${ehEdicao ? "Salvar alterações" : "Cadastrar"}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Alterna visibilidade dos campos de jornada conforme vínculo
  const selectVinculo = document.getElementById("f-vinculo");
  selectVinculo.addEventListener("change", () => {
    document.getElementById("bloco-campos-clt").classList.toggle("campos-clt--visivel", selectVinculo.value === "CLT");
  });

  document.getElementById("btn-cancelar-colab").addEventListener("click", () => modais.innerHTML = "");
  document.getElementById("modal-colab-fundo").addEventListener("click", (e) => {
    if (e.target.id === "modal-colab-fundo") modais.innerHTML = "";
  });

  document.getElementById("form-colaborador").addEventListener("submit", async (e) => {
    e.preventDefault();
    await salvarColaborador(ehEdicao ? c.id : null);
  });
}

async function salvarColaborador(idExistente) {
  const erroEl = document.getElementById("msg-erro-colab");
  const vinculo = document.getElementById("f-vinculo").value;

  const diasSelecionados = Array.from(document.querySelectorAll("#checkbox-dias input:checked"))
    .map(cb => parseInt(cb.value, 10));

  const payload = {
    nome: document.getElementById("f-nome").value.trim(),
    cargo: document.getElementById("f-cargo").value.trim() || null,
    pin: document.getElementById("f-pin").value.trim(),
    vinculo,
    tipo_registro: document.getElementById("f-tipo-registro").value,
  };

  if (vinculo === "CLT") {
    payload.horario_entrada = document.getElementById("f-entrada").value || null;
    payload.horario_saida_almoco = document.getElementById("f-saida-almoco").value || null;
    payload.horario_volta_almoco = document.getElementById("f-volta-almoco").value || null;
    payload.horario_saida = document.getElementById("f-saida").value || null;
    payload.dias_trabalho = diasSelecionados;
  } else {
    payload.horario_entrada = null;
    payload.horario_saida_almoco = null;
    payload.horario_volta_almoco = null;
    payload.horario_saida = null;
  }

  // Se for Gestor criando novo colaborador, associa a si mesmo
  if (!idExistente && perfilLogado?.tipo === "GESTOR") {
    payload.gestor_id = perfilLogado.id;
  }

  let resultado;
  if (idExistente) {
    resultado = await supabaseClient.from("colaboradores").update(payload).eq("id", idExistente);
  } else {
    resultado = await supabaseClient.from("colaboradores").insert(payload);
  }

  if (resultado.error) {
    erroEl.textContent = "Erro ao salvar: " + resultado.error.message;
    return;
  }

  document.getElementById("camada-modais").innerHTML = "";
  carregarColaboradoresPainel();
}

async function excluirColaborador(id) {
  if (!confirm("Tem certeza que deseja remover este colaborador? Os registros de ponto associados também serão removidos.")) return;

  const { error } = await supabaseClient.from("colaboradores").delete().eq("id", id);
  if (error) {
    alert("Erro ao excluir: " + error.message);
    return;
  }
  carregarColaboradoresPainel();
}

document.addEventListener("bsk:perfil-carregado", carregarColaboradoresPainel);
