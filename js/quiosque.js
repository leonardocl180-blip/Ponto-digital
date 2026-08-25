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
    .select("id, nome, foto_url, captcha_ativo")
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
  // Se CAPTCHA estiver ativo para este colaborador, verifica antes de prosseguir
  if (colaboradorSelecionado.captcha_ativo) {
    await mostrarCaptcha();
  } else {
    abrirEscolhaBatida();
  }
}

// ------------------------------------------------------------
// CAPTCHA visual — grade de imagens, selecionar todas de uma categoria
// ------------------------------------------------------------

// Categorias disponíveis: [alvo, emoji, nome para exibição]
const CAPTCHA_CATEGORIAS = [
  { emoji: "🍍", nome: "abacaxis"    , distracao: ["🍎","🍊","🍌","🍇","🍓","🍉","🍋","🥭","🍑","🥥","🍒","🫐"] },
  { emoji: "🍓", nome: "morangos"   , distracao: ["🍎","🍊","🍌","🍍","🍇","🍉","🍋","🥭","🍑","🥥","🍒","🫐"] },
  { emoji: "🍕", nome: "pizzas"     , distracao: ["🍔","🌮","🌯","🥗","🥘","🍜","🍝","🍣","🍦","🧁","🍩","🥐"] },
  { emoji: "🐶", nome: "cachorros"  , distracao: ["🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐸","🐮"] },
  { emoji: "⭐", nome: "estrelas"   , distracao: ["❤️","🔵","🟡","🔴","🟢","🟣","🟠","⚪","🔶","🔷","🔸","🔹"] },
  { emoji: "🚗", nome: "carros"     , distracao: ["✈️","🚢","🚂","🏍","🚲","🛵","🚌","🚁","🛶","🚀","🛸","⛵"] },
  { emoji: "🌸", nome: "flores"     , distracao: ["🌿","🍀","🌵","🌾","🍁","🌴","🌲","🪴","☘️","🌱","🍂","🪻"] },
];

function gerarGradeCaptcha() {
  const cat = CAPTCHA_CATEGORIAS[Math.floor(Math.random() * CAPTCHA_CATEGORIAS.length)];
  const totalCells = 9; // grade 3×3
  const qtdAlvo = Math.floor(Math.random() * 2) + 2; // 2 ou 3 alvos
  const qtdDistrac = totalCells - qtdAlvo;

  // Embaralha distratores e pega os necessários
  const distrac = [...cat.distracao].sort(() => Math.random() - 0.5).slice(0, qtdDistrac);

  // Monta a grade e embaralha
  const celulas = [
    ...Array(qtdAlvo).fill(cat.emoji),
    ...distrac,
  ].sort(() => Math.random() - 0.5);

  return { categoria: cat, celulas, indicesCorretos: celulas.reduce((acc, e, i) => { if (e === cat.emoji) acc.push(i); return acc; }, []) };
}

async function mostrarCaptcha() {
  return new Promise((resolve) => {
    let grade = gerarGradeCaptcha();
    let selecionados = new Set();

    function renderGrade() {
      elModais.innerHTML = `
        <div class="modal-fundo" id="modal-captcha-fundo">
          <div class="modal-pin" style="max-width:340px;">
            <h3 style="font-size:15px;">Verificação de segurança</h3>
            <p class="texto-suave texto-pequeno mt-6" style="text-align:center;">
              Toque em todas as imagens com<br>
              <strong style="color:var(--bsk-amarelo);font-size:22px;">${grade.categoria.emoji} ${grade.categoria.nome}</strong>
            </p>
            <div id="grade-captcha" style="
              display:grid;grid-template-columns:repeat(3,1fr);
              gap:8px;margin:16px 0;">
              ${grade.celulas.map((emoji, i) => `
                <div data-idx="${i}" class="captcha-tile" style="
                  font-size:36px;text-align:center;padding:12px 0;
                  border-radius:10px;cursor:pointer;border:3px solid transparent;
                  background:var(--bsk-cinza-card);
                  transition:border-color .15s,background .15s;
                  user-select:none;">
                  ${emoji}
                </div>
              `).join("")}
            </div>
            <p id="captcha-erro" style="color:#e57373;text-align:center;font-size:13px;min-height:18px;"></p>
            <button class="btn btn--primario btn--bloco mt-8" id="btn-confirmar-captcha">Confirmar</button>
            <button class="btn btn--ghost mt-8" id="btn-cancelar-captcha">Cancelar</button>
          </div>
        </div>
      `;

      // Liga os eventos dos tiles
      document.querySelectorAll(".captcha-tile").forEach(tile => {
        const idx = parseInt(tile.getAttribute("data-idx"));
        if (selecionados.has(idx)) {
          tile.style.borderColor = "var(--bsk-amarelo)";
          tile.style.background  = "rgba(245,197,24,0.15)";
        }
        tile.addEventListener("click", () => {
          if (selecionados.has(idx)) { selecionados.delete(idx); }
          else { selecionados.add(idx); }
          // Atualiza visual do tile clicado sem re-renderizar tudo
          const sel = selecionados.has(idx);
          tile.style.borderColor = sel ? "var(--bsk-amarelo)" : "transparent";
          tile.style.background  = sel ? "rgba(245,197,24,0.15)" : "var(--bsk-cinza-card)";
          document.getElementById("captcha-erro").textContent = "";
        });
      });

      document.getElementById("btn-confirmar-captcha").addEventListener("click", confirmar);
      document.getElementById("btn-cancelar-captcha").addEventListener("click", () => {
        fecharModais(); resolve();
      });
    }

    function confirmar() {
      const corretos   = new Set(grade.indicesCorretos);
      const acertouTodos = [...corretos].every(i => selecionados.has(i));
      const semErro      = [...selecionados].every(i => corretos.has(i));

      if (acertouTodos && semErro) {
        fecharModais(); resolve(); abrirEscolhaBatida();
      } else {
        // Regenera grade para forçar nova tentativa
        selecionados = new Set();
        grade = gerarGradeCaptcha();
        renderGrade();
        document.getElementById("captcha-erro").textContent =
          "Seleção incorreta. Tente novamente com as novas imagens.";
      }
    }

    renderGrade();
  });
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
    mostrarOpcoesSimples();
  }
}

function mostrarOpcoesSimples() {
  elModais.innerHTML = `
    <div class="modal-fundo" id="modal-opcoes-fundo">
      <div class="modal-pin">
        <h3>${colaboradorSelecionado.nome}</h3>
        <p class="texto-suave texto-pequeno mt-8">Qual registro deseja fazer?</p>
        <div class="stack mt-16">
          <button class="btn btn--primario btn--bloco" data-tipo="ENTRADA">Entrada</button>
          <button class="btn btn--secundario btn--bloco" data-tipo="SAIDA_ALMOCO">Saída para almoço</button>
          <button class="btn btn--secundario btn--bloco" data-tipo="VOLTA_ALMOCO">Volta do almoço</button>
          <button class="btn btn--secundario btn--bloco" data-tipo="SAIDA">Saída final</button>
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
