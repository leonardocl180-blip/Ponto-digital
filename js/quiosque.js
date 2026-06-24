// ============================================================
// Quiosque — lógica de seleção, PIN, foto e registro de ponto
// ============================================================

const elGradeColaboradores = document.getElementById("grade-colaboradores");
const elBuscaInput = document.getElementById("busca-input");
const elRelogioHora = document.getElementById("relogio-hora");
const elRelogioData = document.getElementById("relogio-data");
const elModais = document.getElementById("camada-modais");

let colaboradores = [];
let statusHoje = {};
let colaboradorSelecionado = null;
let pinDigitado = "";
let streamCamera = null;
let fotoCapturadaDataUrl = null;
let tipoBatidaEscolhido = null;

// ------------------------------------------------------------
// Relógio em tempo real
// ------------------------------------------------------------
function atualizarRelogio() {
  const agora = new Date();
  elRelogioHora.textContent = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  elRelogioData.textContent = agora.toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
}
atualizarRelogio();
setInterval(atualizarRelogio, 1000 * 15);

// ------------------------------------------------------------
// Carregar colaboradores ativos (view pública, sem PIN)
// ------------------------------------------------------------
async function carregarColaboradores() {
  const { data, error } = await supabaseClient
    .from("quiosque_colaboradores")
    .select("id, nome, foto_url")
    .order("nome");

  if (error) {
    elGradeColaboradores.innerHTML = `<p class="texto-suave">Não foi possível carregar a lista. Verifique a conexão.</p>`;
    console.error(error);
    return;
  }

  colaboradores = data || [];

  // Busca o status de hoje via função RPC segura (a tabela
  // registros_ponto não é legível por usuários anônimos).
  const { data: batidasHoje } = await supabaseClient.rpc("status_hoje_todos_colaboradores");

  statusHoje = {};
  (batidasHoje || []).forEach(b => {
    if (!statusHoje[b.colaborador_id]) statusHoje[b.colaborador_id] = [];
    statusHoje[b.colaborador_id].push(b.tipo);
  });

  renderizarGrade(colaboradores);
}

function iniciais(nome) {
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

function renderizarGrade(lista) {
  if (lista.length === 0) {
    elGradeColaboradores.innerHTML = `<p class="texto-suave">Nenhum colaborador encontrado.</p>`;
    return;
  }
  elGradeColaboradores.innerHTML = lista.map(c => {
    const batidas = statusHoje[c.id] || [];
    const st = calcularStatus(batidas);
    return `
    <div class="cartao-colaborador" data-id="${c.id}">
      <div class="cartao-colaborador__avatar">
        ${c.foto_url ? `<img src="${c.foto_url}" alt="${c.nome}">` : iniciais(c.nome)}
      </div>
      <div class="cartao-colaborador__nome">${c.nome}</div>
      <div class="cartao-colaborador__status" style="color:${st.cor};" title="${st.texto}">
        ${st.emoji} <span>${st.texto}</span>
      </div>
    </div>
  `}).join("");

  document.querySelectorAll(".cartao-colaborador").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      colaboradorSelecionado = colaboradores.find(c => c.id === id);
      abrirModalPin();
    });
  });
}

// ------------------------------------------------------------
// Atualiza apenas os status (pontos coloridos) nos cartões,
// sem recriar a grade inteira. Chamado a cada 30 segundos.
// ------------------------------------------------------------
async function atualizarStatus() {
  const { data: batidasHoje } = await supabaseClient.rpc("status_hoje_todos_colaboradores");

  statusHoje = {};
  (batidasHoje || []).forEach(b => {
    if (!statusHoje[b.colaborador_id]) statusHoje[b.colaborador_id] = [];
    statusHoje[b.colaborador_id].push(b.tipo);
  });

  // Atualiza só os elementos de status já existentes nos cartões
  // (sem recriar o DOM, para não perder o foco/scroll do usuário)
  document.querySelectorAll(".cartao-colaborador[data-id]").forEach(cartao => {
    const id = cartao.getAttribute("data-id");
    const batidas = statusHoje[id] || [];
    const st = calcularStatus(batidas);
    const elStatus = cartao.querySelector(".cartao-colaborador__status");
    if (elStatus) {
      elStatus.style.color = st.cor;
      elStatus.title = st.texto;
      elStatus.innerHTML = `${st.emoji} <span>${st.texto}</span>`;
    }
  });
}

// ------------------------------------------------------------
// Atualização em tempo real via Supabase Realtime
// ------------------------------------------------------------
function iniciarRealtimeStatus() {
  supabaseClient
    .channel("registros-ponto-hoje")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "registros_ponto" },
      () => { atualizarStatus(); }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("Realtime: monitorando batidas de ponto.");
      }
    });
}

// Fallback: se o Realtime falhar por qualquer razão (rede, RLS, etc),
// o setInterval garante que o status apareça no máximo em 30 segundos
setInterval(atualizarStatus, 30 * 1000);

elBuscaInput.addEventListener("input", () => {
  const termo = elBuscaInput.value.trim().toLowerCase();
  const filtrados = colaboradores.filter(c => c.nome.toLowerCase().includes(termo));
  renderizarGrade(filtrados);
});

// ------------------------------------------------------------
// Modal de PIN
// ------------------------------------------------------------
function abrirModalPin() {
  pinDigitado = "";
  elModais.innerHTML = `
    <div class="modal-fundo" id="modal-pin-fundo">
      <div class="modal-pin">
        <div class="modal-pin__avatar">
          ${colaboradorSelecionado.foto_url
            ? `<img src="${colaboradorSelecionado.foto_url}" alt="">`
            : iniciais(colaboradorSelecionado.nome)}
        </div>
        <h3>${colaboradorSelecionado.nome}</h3>
        <p class="texto-suave texto-pequeno mt-8">Digite seu PIN para confirmar</p>
        <div class="pin-pontos" id="pin-pontos">
          ${[0,1,2,3].map(() => `<div class="pin-ponto"></div>`).join("")}
        </div>
        <div class="pin-erro" id="pin-erro"></div>
        <div class="teclado-numerico" id="teclado-numerico">
          ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="tecla" data-tecla="${n}">${n}</button>`).join("")}
          <button class="tecla tecla--acao" data-tecla="cancelar">Cancelar</button>
          <button class="tecla" data-tecla="0">0</button>
          <button class="tecla tecla--acao" data-tecla="apagar">⌫</button>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll("#teclado-numerico .tecla").forEach(tecla => {
    tecla.addEventListener("click", () => onTeclaPin(tecla.getAttribute("data-tecla")));
  });

  document.getElementById("modal-pin-fundo").addEventListener("click", (e) => {
    if (e.target.id === "modal-pin-fundo") fecharModais();
  });
}

function onTeclaPin(tecla) {
  if (tecla === "cancelar") { fecharModais(); return; }
  if (tecla === "apagar") {
    pinDigitado = pinDigitado.slice(0, -1);
    renderizarPontosPin();
    return;
  }
  if (pinDigitado.length >= 4) return;
  pinDigitado += tecla;
  renderizarPontosPin();

  if (pinDigitado.length === 4) {
    setTimeout(() => validarPin(), 150);
  }
}

function renderizarPontosPin() {
  const pontos = document.querySelectorAll("#pin-pontos .pin-ponto");
  pontos.forEach((p, i) => {
    p.classList.toggle("pin-ponto--preenchido", i < pinDigitado.length);
  });
}

async function validarPin() {
  const erroEl = document.getElementById("pin-erro");
  const { data, error } = await supabaseClient.rpc("validar_pin_colaborador", {
    p_colaborador_id: colaboradorSelecionado.id,
    p_pin: pinDigitado
  });

  if (error || !data) {
    erroEl.textContent = "PIN incorreto. Tente novamente.";
    pinDigitado = "";
    renderizarPontosPin();
    return;
  }

  fecharModais();
  abrirEscolhaBatida();
}

function fecharModais() {
  elModais.innerHTML = "";
  pararCamera();
}

// ------------------------------------------------------------
// Escolha do tipo de batida
// Busca config do colaborador (modo simples vs livre) e mostra
// as opções adequadas.
// ------------------------------------------------------------
async function abrirEscolhaBatida() {
  // Usamos a tabela completa aqui só para ler tipo_registro —
  // isso exige que a policy de leitura pública cubra esse campo;
  // como alternativa mais segura, expomos via RPC dedicado.
  const { data, error } = await supabaseClient.rpc("tipo_registro_colaborador", {
    p_colaborador_id: colaboradorSelecionado.id
  }).single();

  let tipoRegistro = "SIMPLES";
  if (!error && data) tipoRegistro = data;

  if (tipoRegistro === "LIVRE") {
    await mostrarOpcoesLivre();
  } else {
    await mostrarOpcoesSimples();
  }
}

const ORDEM_BATIDAS_SIMPLES = ["ENTRADA", "SAIDA_ALMOCO", "VOLTA_ALMOCO", "SAIDA"];
const LABELS_BATIDAS_SIMPLES = {
  ENTRADA: "Entrada",
  SAIDA_ALMOCO: "Início do intervalo",
  VOLTA_ALMOCO: "Fim do intervalo",
  SAIDA: "Saída",
  ENTRADA_LIVRE: "Entrada",
  SAIDA_LIVRE: "Saída"
};

// Status derivado das batidas já feitas hoje
function calcularStatus(jaFeitas) {
  if (jaFeitas.includes("SAIDA") || jaFeitas.includes("SAIDA_LIVRE"))
    return { texto: "Fora do trabalho", cor: "#888",    emoji: "🔴" };
  if (jaFeitas.includes("VOLTA_ALMOCO"))
    return { texto: "Trabalhando",      cor: "#4caf50", emoji: "🟢" };
  if (jaFeitas.includes("SAIDA_ALMOCO"))
    return { texto: "Em intervalo",     cor: "#ff9800", emoji: "🟡" };
  if (jaFeitas.includes("ENTRADA") || jaFeitas.includes("ENTRADA_LIVRE"))
    return { texto: "Trabalhando",      cor: "#4caf50", emoji: "🟢" };
  return { texto: "Não entrou ainda",   cor: "#888",    emoji: "⚪" };
}

// Detecta automaticamente o próximo tipo de batida
function detectarProximoBatida(jaFeitas, modoLivre) {
  if (modoLivre) {
    // MEI: alterna entrada/saída. Se o último foi entrada → próxima é saída
    const ultimaLivre = [...jaFeitas].reverse().find(t => t === "ENTRADA_LIVRE" || t === "SAIDA_LIVRE");
    return ultimaLivre === "ENTRADA_LIVRE" ? "SAIDA_LIVRE" : "ENTRADA_LIVRE";
  }
  return ORDEM_BATIDAS_SIMPLES.find(t => !jaFeitas.includes(t)) || null;
}

async function mostrarConfirmacaoBatida(modoLivre) {
  const { data: jaFeitasData } = await supabaseClient.rpc("batidas_hoje_colaborador", {
    p_colaborador_id: colaboradorSelecionado.id
  });
  const jaFeitas = Array.isArray(jaFeitasData) ? jaFeitasData : [];
  const proximaTipo = detectarProximoBatida(jaFeitas, modoLivre);
  const status = calcularStatus(jaFeitas);
  const labelProxima = proximaTipo ? LABELS_BATIDAS_SIMPLES[proximaTipo] : null;

  elModais.innerHTML = `
    <div class="modal-fundo" id="modal-opcoes-fundo">
      <div class="modal-pin">
        <h3>${colaboradorSelecionado.nome}</h3>
        <p style="display:flex;align-items:center;gap:6px;justify-content:center;margin-top:6px;">
          <span>${status.emoji}</span>
          <span style="color:${status.cor};font-weight:600;font-size:14px;">${status.texto}</span>
        </p>

        ${labelProxima ? `
          <div style="margin:20px 0 8px;text-align:center;">
            <p class="texto-suave texto-pequeno">Registrar agora:</p>
            <p style="font-size:20px;font-weight:700;color:var(--bsk-amarelo);margin-top:4px;">${labelProxima}</p>
          </div>
          <button class="btn btn--primario btn--bloco" id="btn-confirmar-batida" data-tipo="${proximaTipo}">
            ✓ Confirmar
          </button>
          <details style="margin-top:12px;text-align:center;">
            <summary class="texto-suave texto-pequeno" style="cursor:pointer;list-style:none;">Registrar outro tipo</summary>
            <div class="stack mt-12">
              ${(modoLivre
                ? ["ENTRADA_LIVRE","SAIDA_LIVRE"]
                : ORDEM_BATIDAS_SIMPLES
              ).filter(t => t !== proximaTipo).map(tipo => `
                <button class="btn btn--secundario btn--bloco" data-tipo="${tipo}">${LABELS_BATIDAS_SIMPLES[tipo]}</button>
              `).join("")}
            </div>
          </details>
        ` : `
          <p class="texto-suave texto-pequeno mt-16" style="text-align:center;">
            Todos os registros de hoje já foram feitos.<br>Se precisar corrigir, escolha abaixo:
          </p>
          <div class="stack mt-12">
            ${(modoLivre ? ["ENTRADA_LIVRE","SAIDA_LIVRE"] : ORDEM_BATIDAS_SIMPLES)
              .map(tipo => `<button class="btn btn--secundario btn--bloco" data-tipo="${tipo}">${LABELS_BATIDAS_SIMPLES[tipo]}</button>`)
              .join("")}
          </div>
        `}

        <button class="btn btn--ghost mt-16" id="btn-cancelar-opcoes">Cancelar</button>
      </div>
    </div>
  `;
  ligarBotoesOpcoes();
}

// Mantido por compatibilidade — agora ambos usam a função unificada
async function mostrarOpcoesSimples() { await mostrarConfirmacaoBatida(false); }
async function mostrarOpcoesLivre()   { await mostrarConfirmacaoBatida(true);  }

function ligarBotoesOpcoes() {
  document.querySelectorAll("[data-tipo]").forEach(btn => {
    btn.addEventListener("click", () => {
      tipoBatidaEscolhido = btn.getAttribute("data-tipo");
      abrirCamera();
    });
  });
  document.getElementById("btn-cancelar-opcoes").addEventListener("click", fecharModais);
}

// ------------------------------------------------------------
// Captura de foto
// ------------------------------------------------------------
async function abrirCamera() {
  elModais.innerHTML = `
    <div class="modal-fundo" id="modal-camera-fundo">
      <div class="modal-pin" style="max-width:420px;">
        <h3>Sorria! 📸</h3>
        <p class="texto-suave texto-pequeno mt-8">Confirme sua identidade para registrar o ponto</p>
        <div class="camera-wrap mt-16">
          <video id="video-camera" autoplay playsinline></video>
        </div>
        <div id="camera-status" class="texto-suave texto-pequeno mt-8" style="text-align:center;"></div>
        <div class="stack mt-16">
          <button class="btn btn--primario btn--bloco" id="btn-tirar-foto">Tirar foto e registrar</button>
          <button class="btn btn--ghost" id="btn-cancelar-camera">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  // Cancelar: para a câmera E volta sem registrar nada
  document.getElementById("btn-cancelar-camera").addEventListener("click", () => {
    pararCamera();
    fecharModais();
  });
  document.getElementById("btn-tirar-foto").addEventListener("click", tirarFotoERegistrar);

  try {
    streamCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    document.getElementById("video-camera").srcObject = streamCamera;
  } catch (e) {
    console.error("Erro ao acessar câmera:", e);
    // Câmera indisponível: avisa e oferece registrar sem foto
    // (não registra silenciosamente)
    const statusEl = document.getElementById("camera-status");
    const tirarBtn = document.getElementById("btn-tirar-foto");
    if (statusEl) statusEl.textContent = "Câmera indisponível neste dispositivo.";
    if (tirarBtn) {
      tirarBtn.textContent = "Registrar sem foto";
      tirarBtn.onclick = async () => { await registrarEFinalizar(null); };
    }
  }
}

function pararCamera() {
  if (streamCamera) {
    streamCamera.getTracks().forEach(t => t.stop());
    streamCamera = null;
  }
}

async function tirarFotoERegistrar() {
  const video = document.getElementById("video-camera");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 480;
  canvas.height = video.videoHeight || 360;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  fotoCapturadaDataUrl = canvas.toDataURL("image/jpeg", 0.7);

  pararCamera();
  await registrarEFinalizar(fotoCapturadaDataUrl);
}

// ------------------------------------------------------------
// Upload da foto (se houver conexão) + registro da batida
// ------------------------------------------------------------
async function uploadFoto(dataUrl, colaboradorId) {
  if (!dataUrl || !navigator.onLine) return null;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const nomeArquivo = `${colaboradorId}/${Date.now()}.jpg`;
    const { error } = await supabaseClient.storage
      .from("fotos-ponto")
      .upload(nomeArquivo, blob, { contentType: "image/jpeg" });
    if (error) { console.error("Erro no upload da foto:", error); return null; }
    const { data } = supabaseClient.storage.from("fotos-ponto").getPublicUrl(nomeArquivo);
    return data?.publicUrl || null;
  } catch (e) {
    console.error("Erro processando foto:", e);
    return null;
  }
}

async function registrarEFinalizar(fotoDataUrl) {
  mostrarTelaCarregando();

  let fotoUrl = null;
  if (fotoDataUrl) {
    fotoUrl = await uploadFoto(fotoDataUrl, colaboradorSelecionado.id);
  }

  const resultado = await registrarBatida({
    colaborador_id: colaboradorSelecionado.id,
    tipo: tipoBatidaEscolhido,
    foto_url: fotoUrl
  });

  mostrarConfirmacao(resultado.offline);
}

function mostrarTelaCarregando() {
  elModais.innerHTML = `
    <div class="modal-fundo">
      <div class="modal-pin">
        <p class="texto-suave">Registrando...</p>
      </div>
    </div>
  `;
}

function mostrarConfirmacao(offline) {
  const nomeBatida = {
    ENTRADA: "Entrada", SAIDA_ALMOCO: "Início do intervalo",
    VOLTA_ALMOCO: "Fim do intervalo", SAIDA: "Saída",
    ENTRADA_LIVRE: "Entrada", SAIDA_LIVRE: "Saída"
  }[tipoBatidaEscolhido] || "Ponto";

  const horaAtual = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  elModais.innerHTML = `
    <div class="modal-fundo">
      <div class="modal-pin tela-confirmacao">
        <div class="tela-confirmacao__icone">✓</div>
        <h3>${nomeBatida} registrada!</h3>
        <p class="texto-suave mt-8">${colaboradorSelecionado.nome} • ${horaAtual}</p>
        ${offline ? `<p class="texto-pequeno mt-8" style="color:var(--bsk-amarelo)">Sem conexão — será sincronizado automaticamente.</p>` : ""}
        <button class="btn btn--primario btn--bloco mt-24" id="btn-fechar-confirmacao">Concluir</button>
      </div>
    </div>
  `;
  document.getElementById("btn-fechar-confirmacao").addEventListener("click", fecharModais);

  // Atualiza os status dos cartões imediatamente após a batida,
  // sem esperar o intervalo de 30 segundos
  atualizarStatus();

  setTimeout(() => {
    if (document.getElementById("btn-fechar-confirmacao")) fecharModais();
  }, 4000);
}

// ------------------------------------------------------------
// Aviso de sincronização offline (escuta evento global)
// ------------------------------------------------------------
document.addEventListener("bsk:sincronizado", (e) => {
  console.log("Sincronização concluída:", e.detail);
});

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
carregarColaboradores();
iniciarRealtimeStatus();
