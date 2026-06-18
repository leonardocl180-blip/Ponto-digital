// ============================================================
// Quiosque — lógica de seleção, PIN, foto e registro de ponto
// ============================================================

const elGradeColaboradores = document.getElementById("grade-colaboradores");
const elBuscaInput = document.getElementById("busca-input");
const elRelogioHora = document.getElementById("relogio-hora");
const elRelogioData = document.getElementById("relogio-data");
const elModais = document.getElementById("camada-modais");

let colaboradores = [];
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
  elGradeColaboradores.innerHTML = lista.map(c => `
    <div class="cartao-colaborador" data-id="${c.id}">
      <div class="cartao-colaborador__avatar">
        ${c.foto_url ? `<img src="${c.foto_url}" alt="${c.nome}">` : iniciais(c.nome)}
      </div>
      <div class="cartao-colaborador__nome">${c.nome}</div>
    </div>
  `).join("");

  document.querySelectorAll(".cartao-colaborador").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      colaboradorSelecionado = colaboradores.find(c => c.id === id);
      abrirModalPin();
    });
  });
}

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
    mostrarOpcoesLivre();
  } else {
    await mostrarOpcoesSimples();
  }
}

const ORDEM_BATIDAS_SIMPLES = ["ENTRADA", "SAIDA_ALMOCO", "VOLTA_ALMOCO", "SAIDA"];
const LABELS_BATIDAS_SIMPLES = {
  ENTRADA: "Entrada",
  SAIDA_ALMOCO: "Saída para almoço",
  VOLTA_ALMOCO: "Volta do almoço",
  SAIDA: "Saída final"
};

async function mostrarOpcoesSimples() {
  // Olha o que já foi batido hoje para sugerir o próximo passo
  // (em vez de mostrar 4 botões iguais sem nenhuma pista).
  const { data: jaFeitasData } = await supabaseClient.rpc("batidas_hoje_colaborador", {
    p_colaborador_id: colaboradorSelecionado.id
  });
  const jaFeitas = Array.isArray(jaFeitasData) ? jaFeitasData : [];
  const proximaSugerida = ORDEM_BATIDAS_SIMPLES.find(t => !jaFeitas.includes(t)) || null;

  elModais.innerHTML = `
    <div class="modal-fundo" id="modal-opcoes-fundo">
      <div class="modal-pin">
        <h3>${colaboradorSelecionado.nome}</h3>
        <p class="texto-suave texto-pequeno mt-8">
          ${proximaSugerida
            ? `Próximo registro de hoje: <strong style="color:var(--bsk-amarelo)">${LABELS_BATIDAS_SIMPLES[proximaSugerida]}</strong>`
            : "Todos os registros de hoje já foram feitos. Se precisar bater de novo, escolha abaixo:"}
        </p>
        <div class="stack mt-16">
          ${ORDEM_BATIDAS_SIMPLES.map(tipo => {
            const feita = jaFeitas.includes(tipo);
            const sugerida = tipo === proximaSugerida;
            return `<button class="btn ${sugerida ? "btn--primario" : "btn--secundario"} btn--bloco" data-tipo="${tipo}">${feita ? "✓ " : ""}${LABELS_BATIDAS_SIMPLES[tipo]}${feita ? " — já registrada hoje" : ""}</button>`;
          }).join("")}
        </div>
        <button class="btn btn--ghost mt-16" id="btn-cancelar-opcoes">Cancelar</button>
      </div>
    </div>
  `;
  ligarBotoesOpcoes();
}

function mostrarOpcoesLivre() {
  elModais.innerHTML = `
    <div class="modal-fundo" id="modal-opcoes-fundo">
      <div class="modal-pin">
        <h3>${colaboradorSelecionado.nome}</h3>
        <p class="texto-suave texto-pequeno mt-8">Registrar entrada ou saída?</p>
        <div class="opcoes-batida mt-16">
          <button class="btn btn--primario" data-tipo="ENTRADA_LIVRE">Entrada</button>
          <button class="btn btn--secundario" data-tipo="SAIDA_LIVRE">Saída</button>
        </div>
        <button class="btn btn--ghost mt-16" id="btn-cancelar-opcoes">Cancelar</button>
      </div>
    </div>
  `;
  ligarBotoesOpcoes();
}

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
        <div class="stack mt-16">
          <button class="btn btn--primario btn--bloco" id="btn-tirar-foto">Tirar foto e registrar</button>
          <button class="btn btn--ghost" id="btn-cancelar-camera">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-cancelar-camera").addEventListener("click", fecharModais);
  document.getElementById("btn-tirar-foto").addEventListener("click", tirarFotoERegistrar);

  try {
    streamCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    document.getElementById("video-camera").srcObject = streamCamera;
  } catch (e) {
    console.error("Erro ao acessar câmera:", e);
    // Sem câmera disponível: segue sem foto
    await registrarEFinalizar(null);
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
    ENTRADA: "Entrada", SAIDA_ALMOCO: "Saída para almoço",
    VOLTA_ALMOCO: "Volta do almoço", SAIDA: "Saída",
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
