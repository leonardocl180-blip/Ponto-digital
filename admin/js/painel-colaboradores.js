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
                <option value="SIMPLES" ${c.tipo_registro === "SIMPLES" ? "selected" : ""}>Com intervalo (CLT)</option>
                <option value="LIVRE" ${c.tipo_registro === "LIVRE" ? "selected" : ""}>Múltiplas batidas (MEI)</option>
              </select>
            </div>
          </div>

          <div id="bloco-campos-clt" class="${c.vinculo === "CLT" ? "campos-clt--visivel" : ""} campos-clt">
            <label class="bsk-label">Jornada fixa</label>
            <div class="row">
              <div class="flex-1">
                <label class="bsk-label bsk-label--pequeno">Entrada</label>
                <input type="time" id="f-entrada" class="input" value="${c.horario_entrada?.slice(0,5) || ""}">
              </div>
              <div class="flex-1">
                <label class="bsk-label bsk-label--pequeno">Início intervalo</label>
                <input type="time" id="f-saida-almoco" class="input" value="${c.horario_saida_almoco?.slice(0,5) || ""}">
              </div>
            </div>
            <div class="row mt-8">
              <div class="flex-1">
                <label class="bsk-label bsk-label--pequeno">Fim intervalo</label>
                <input type="time" id="f-volta-almoco" class="input" value="${c.horario_volta_almoco?.slice(0,5) || ""}">
              </div>
              <div class="flex-1">
                <label class="bsk-label bsk-label--pequeno">Saída</label>
                <input type="time" id="f-saida" class="input" value="${c.horario_saida?.slice(0,5) || ""}">
              </div>
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

          <div id="bloco-campos-mei" class="${c.vinculo === "MEI" ? "campos-mei--visivel" : ""} campos-mei">
            <label class="bsk-label">Período do relatório</label>
            <select id="f-periodo-mei" class="input">
              <option value="SEMANAL">Semanal (segunda a domingo)</option>
              <option value="QUINZENAL" selected>Quinzenal</option>
            </select>
            <label class="bsk-label mt-16">Valor por hora (R$)</label>
            <input type="number" id="f-valor-hora" class="input" min="0" step="0.01" placeholder="Ex: 25.00">
            <p class="texto-suave texto-pequeno mt-8">Usado para calcular o valor total no relatório PDF.</p>
          </div>

          <div style="display:flex;align-items:center;gap:12px;margin-top:16px;">
            <label class="bsk-label" style="margin:0;flex:1;">Reconhecimento facial</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="f-reconhecimento" ${c.reconhecimento_facial_ativo ? "checked" : ""}>
              <span class="texto-pequeno texto-suave" id="label-reconhecimento">
                ${c.reconhecimento_facial_ativo ? "Ativado" : "Desativado"}
              </span>
            </label>
          </div>
          ${ehEdicao && c.reconhecimento_facial_ativo !== undefined ? `
          <button type="button" class="btn btn--secundario btn--bloco mt-8" id="btn-cadastrar-rosto">
            📷 ${c.descritor_facial ? "Atualizar rosto de referência" : "Cadastrar rosto de referência"}
          </button>
          ` : ""}

          <div id="msg-erro-colab" class="texto-pequeno" style="color: var(--bsk-vermelho); min-height: 18px;"></div>

          <div class="row mt-8">
            <button type="button" class="btn btn--secundario flex-1" id="btn-cancelar-colab">Cancelar</button>
            <button type="submit" class="btn btn--primario flex-1">${ehEdicao ? "Salvar alterações" : "Cadastrar"}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Alterna visibilidade dos campos de jornada (CLT) ou período (MEI) conforme vínculo
  const selectVinculo = document.getElementById("f-vinculo");
  selectVinculo.addEventListener("change", () => {
    const ehMei = selectVinculo.value === "MEI";
    document.getElementById("bloco-campos-clt").classList.toggle("campos-clt--visivel", !ehMei);
    document.getElementById("bloco-campos-mei").classList.toggle("campos-mei--visivel", ehMei);
  });

  // Se for edição de um colaborador MEI que já tem período salvo, pré-seleciona
  if (ehEdicao && c.vinculo === "MEI") {
    supabaseClient
      .from("config_relatorio_mei")
      .select("periodo, valor_hora")
      .eq("colaborador_id", c.id)
      .maybeSingle()
      .then(({ data }) => {
        const selPeriodo = document.getElementById("f-periodo-mei");
        if (data?.periodo && selPeriodo) selPeriodo.value = data.periodo;
        const inputValor = document.getElementById("f-valor-hora");
        if (data?.valor_hora != null && inputValor) inputValor.value = data.valor_hora;
      });
  }

  document.getElementById("btn-cancelar-colab").addEventListener("click", () => modais.innerHTML = "");

  // Toggle reconhecimento facial
  document.getElementById("f-reconhecimento")?.addEventListener("change", function () {
    const label = document.getElementById("label-reconhecimento");
    if (label) label.textContent = this.checked ? "Ativado" : "Desativado";
  });

  // Cadastrar rosto de referência
  document.getElementById("btn-cadastrar-rosto")?.addEventListener("click", () => {
    abrirCameraReferencia(c.id, () => {
      // Após cadastrar, atualiza o botão
      const btn = document.getElementById("btn-cadastrar-rosto");
      if (btn) btn.textContent = "📷 Atualizar rosto de referência";
    });
  });
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

  const reconhecimentoEl = document.getElementById("f-reconhecimento");
  const payload = {
    nome: document.getElementById("f-nome").value.trim(),
    cargo: document.getElementById("f-cargo").value.trim() || null,
    pin: document.getElementById("f-pin").value.trim(),
    vinculo,
    tipo_registro: document.getElementById("f-tipo-registro").value,
    reconhecimento_facial_ativo: reconhecimentoEl ? reconhecimentoEl.checked : false,
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
  let colaboradorId = idExistente;

  if (idExistente) {
    resultado = await supabaseClient.from("colaboradores").update(payload).eq("id", idExistente);
  } else {
    resultado = await supabaseClient.from("colaboradores").insert(payload).select("id").single();
    if (!resultado.error) colaboradorId = resultado.data.id;
  }

  if (resultado.error) {
    erroEl.textContent = "Erro ao salvar: " + resultado.error.message;
    return;
  }

  // Período do relatório (semanal/quinzenal) só existe para MEI
  if (vinculo === "MEI" && colaboradorId) {
    const periodo = document.getElementById("f-periodo-mei").value;
    const valorHoraRaw = document.getElementById("f-valor-hora").value;
    const valorHora = valorHoraRaw !== "" ? parseFloat(valorHoraRaw) : null;
    const { error: erroPeriodo } = await supabaseClient
      .from("config_relatorio_mei")
      .upsert({ colaborador_id: colaboradorId, periodo, valor_hora: valorHora });
    if (erroPeriodo) {
      erroEl.textContent = "Colaborador salvo, mas houve erro ao salvar configuração MEI: " + erroPeriodo.message;
      return;
    }
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

// ============================================================
// Cadastro de rosto de referência para reconhecimento facial
// ============================================================
const FACE_API_MODELS_URL_ADMIN = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/";
let adminFaceModelsLoaded = false;

async function carregarModelosFaceAdmin() {
  if (adminFaceModelsLoaded || typeof faceapi === "undefined") return;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODELS_URL_ADMIN),
    faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODELS_URL_ADMIN),
    faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODELS_URL_ADMIN),
  ]);
  adminFaceModelsLoaded = true;
}

async function abrirCameraReferencia(colaboradorId, onSucesso) {
  const modais = document.getElementById("camada-modais");
  // Sobrepõe o modal atual com um de câmera
  const wrapId = "modal-camera-ref";
  const div = document.createElement("div");
  div.id = wrapId;
  div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;";
  div.innerHTML = `
    <div class="card" style="max-width:420px;width:100%;text-align:center;">
      <h3>📷 Cadastrar rosto de referência</h3>
      <p class="texto-suave texto-pequeno mt-8">Posicione o rosto do colaborador e aguarde a detecção</p>
      <div style="position:relative;margin-top:16px;">
        <video id="video-ref" autoplay playsinline
          style="transform:scaleX(-1);width:100%;border-radius:var(--raio-medio);display:block;"></video>
        <div id="overlay-ref" style="position:absolute;inset:0;border-radius:var(--raio-medio);border:4px solid transparent;transition:border-color 0.25s;pointer-events:none;"></div>
      </div>
      <p id="status-ref" class="texto-pequeno mt-8" style="font-weight:600;min-height:20px;"></p>
      <div class="row mt-16">
        <button class="btn btn--secundario flex-1" id="btn-cancelar-ref">Cancelar</button>
        <button class="btn btn--primario flex-1" id="btn-capturar-ref" disabled style="opacity:0.5;cursor:not-allowed;">Capturar</button>
      </div>
      <p id="msg-ref" class="texto-pequeno mt-8" style="color:#e57373;"></p>
    </div>
  `;
  document.body.appendChild(div);

  let streamRef = null;
  let faceIntervalRef = null;
  let descriptorCapturado = null;

  function pararTudo() {
    if (faceIntervalRef) { clearInterval(faceIntervalRef); faceIntervalRef = null; }
    if (streamRef) { streamRef.getTracks().forEach(t => t.stop()); streamRef = null; }
    document.getElementById(wrapId)?.remove();
  }

  document.getElementById("btn-cancelar-ref").addEventListener("click", pararTudo);

  document.getElementById("btn-capturar-ref").addEventListener("click", async () => {
    if (!descriptorCapturado) return;
    const msgEl = document.getElementById("msg-ref");
    msgEl.style.color = "#aaa";
    msgEl.textContent = "Salvando...";
    const { error } = await supabaseClient
      .from("colaboradores")
      .update({ descritor_facial: descriptorCapturado })
      .eq("id", colaboradorId);
    if (error) { msgEl.style.color = "#e57373"; msgEl.textContent = "Erro: " + error.message; return; }
    pararTudo();
    if (onSucesso) onSucesso();
  });

  try {
    streamRef = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    const video = document.getElementById("video-ref");
    video.srcObject = streamRef;

    video.addEventListener("playing", async () => {
      const statusEl = document.getElementById("status-ref");
      statusEl.textContent = "Carregando modelos...";
      statusEl.style.color = "#aaa";
      try {
        await carregarModelosFaceAdmin();
      } catch (e) {
        statusEl.textContent = "Erro ao carregar modelos de reconhecimento facial.";
        statusEl.style.color = "#e57373";
        return;
      }

      const overlay = document.getElementById("overlay-ref");
      faceIntervalRef = setInterval(async () => {
        if (!document.getElementById("video-ref")) { clearInterval(faceIntervalRef); return; }
        try {
          const det = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          const btn = document.getElementById("btn-capturar-ref");
          if (det) {
            descriptorCapturado = Array.from(det.descriptor);
            overlay.style.borderColor = "#4caf50";
            statusEl.style.color = "#4caf50";
            statusEl.textContent = "✓ Rosto detectado — pronto para capturar";
            if (btn) { btn.disabled = false; btn.style.opacity = "1"; btn.style.cursor = "pointer"; }
          } else {
            descriptorCapturado = null;
            overlay.style.borderColor = "#e57373";
            statusEl.style.color = "#e57373";
            statusEl.textContent = "Posicione o rosto no centro";
            if (btn) { btn.disabled = true; btn.style.opacity = "0.5"; btn.style.cursor = "not-allowed"; }
          }
        } catch (_) {}
      }, 400);
    }, { once: true });
  } catch (e) {
    document.getElementById("msg-ref").textContent = "Câmera indisponível neste dispositivo.";
  }
}
