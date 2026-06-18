// ============================================================
// Configuração central do Supabase
// ============================================================
// A chave "anon" abaixo é pública por design — ela só permite o
// que as políticas de RLS no banco autorizarem. Não é um segredo.
// ============================================================

const SUPABASE_URL = "https://vzvsycsvdqahmojvxdqu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dnN5Y3N2ZHFhaG1vanZ4ZHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDgxMjMsImV4cCI6MjA5NzI4NDEyM30.V5RJORwSNlwj6sQFOjVEPNV8g2YT_q52wqI0rsuban8";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------------------------------------------------
// Fila local de sincronização (fallback offline)
// Usada pelo quiosque: se a requisição ao Supabase falhar por
// falta de conexão, a batida é salva no localStorage e reenviada
// automaticamente quando a conexão voltar.
// ------------------------------------------------------------
const FILA_OFFLINE_KEY = "bsk_fila_offline_v1";

function lerFilaOffline() {
  try {
    const raw = localStorage.getItem(FILA_OFFLINE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Erro lendo fila offline:", e);
    return [];
  }
}

function salvarFilaOffline(fila) {
  localStorage.setItem(FILA_OFFLINE_KEY, JSON.stringify(fila));
}

function adicionarNaFilaOffline(registro) {
  const fila = lerFilaOffline();
  fila.push(registro);
  salvarFilaOffline(fila);
}

async function sincronizarFilaOffline() {
  const fila = lerFilaOffline();
  if (fila.length === 0) return { sincronizados: 0, restantes: 0 };

  const restantes = [];
  let sincronizados = 0;

  for (const registro of fila) {
    const { error } = await supabaseClient.from("registros_ponto").insert({
      colaborador_id: registro.colaborador_id,
      tipo: registro.tipo,
      data_hora: registro.data_hora,
      foto_url: registro.foto_url || null,
      origem: "OFFLINE_SYNC"
    });
    if (error) {
      restantes.push(registro);
    } else {
      sincronizados++;
    }
  }

  salvarFilaOffline(restantes);
  return { sincronizados, restantes: restantes.length };
}

// Tenta sincronizar sempre que a conexão voltar
window.addEventListener("online", async () => {
  const resultado = await sincronizarFilaOffline();
  if (resultado.sincronizados > 0) {
    console.log(`${resultado.sincronizados} registro(s) offline sincronizado(s).`);
    document.dispatchEvent(new CustomEvent("bsk:sincronizado", { detail: resultado }));
  }
});

// ------------------------------------------------------------
// Helper: registra uma batida de ponto, com fallback offline
// ------------------------------------------------------------
async function registrarBatida({ colaborador_id, tipo, foto_url }) {
  const data_hora = new Date().toISOString();

  if (!navigator.onLine) {
    adicionarNaFilaOffline({ colaborador_id, tipo, data_hora, foto_url });
    return { ok: true, offline: true };
  }

  const { error } = await supabaseClient.from("registros_ponto").insert({
    colaborador_id,
    tipo,
    data_hora,
    foto_url: foto_url || null,
    origem: "ONLINE"
  });

  if (error) {
    // Falhou mesmo "online" (ex: instabilidade) -> guarda local também
    adicionarNaFilaOffline({ colaborador_id, tipo, data_hora, foto_url });
    return { ok: true, offline: true, erroOriginal: error.message };
  }

  return { ok: true, offline: false };
}
