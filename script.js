// =====================================================
// FEEDBACK DE TOQUE (som + vibração)
// Sem arquivo de áudio: o "toc" é gerado na hora pelo navegador
// =====================================================
let audioCtx = null;

function initAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { audioCtx = new AC(); } catch (e) { audioCtx = null; }
}

function tocarBlip(freq) {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const agora = audioCtx.currentTime;
    const dur   = 0.09;
    const osc   = audioCtx.createOscillator();
    const ganho = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, agora);

    // Envelope curto para soar como um clique, sem estalo
    ganho.gain.setValueAtTime(0.0001, agora);
    ganho.gain.exponentialRampToValueAtTime(0.14, agora + 0.008);
    ganho.gain.exponentialRampToValueAtTime(0.0001, agora + dur);

    osc.connect(ganho);
    ganho.connect(audioCtx.destination);
    osc.start(agora);
    osc.stop(agora + dur + 0.02);
}

function vibrar(padrao) {
    if (!navigator.vibrate) return;
    // O navegador só permite vibrar dentro de um toque real do usuário
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    try { navigator.vibrate(padrao); } catch (e) {}
}

// Som + vibração para confirmar que o toque foi registrado
function feedbackToque(tipo) {
    const notas = { play: 880, pause: 660, stop: 440, speed: 1046 };
    tocarBlip(notas[tipo] || 880);
    vibrar(tipo === 'stop' ? [12, 45, 12] : 15);
}

// =====================================================
// SÍNTESE DE VOZ
// Celulares emudecem falas longas e travam se speak() vier
// logo depois de cancel() — por isso o texto é lido em trechos.
// =====================================================
const sintese = window.speechSynthesis;

// ~120 caracteres dão cerca de 10s de fala: abaixo do corte de ~15s que o
// Chrome aplica em falas longas, e dentro do que o Android/iOS aguentam
const MAX_TRECHO = 120;

let trechos        = [];
let trechoAtual    = 0;
let offsetNoTrecho = 0;   // posição da última palavra lida dentro do trecho
let lendo          = false;
let isPaused       = false;
let geracao        = 0;   // invalida callbacks de falas já canceladas
let vozPtBr        = null;

// Velocidades disponíveis e índice atual (padrão: 1.0×)
const VELOCIDADES   = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
let velocidadeIndex = 2;

function getVelocidade() {
    return VELOCIDADES[velocidadeIndex];
}

// --- Voz em português -------------------------------------------------
function carregarVoz() {
    if (!sintese) return;
    const vozes = sintese.getVoices();
    if (!vozes.length) return;

    vozPtBr = null;
    for (let i = 0; i < vozes.length; i++) {
        if (/pt[-_]BR/i.test(vozes[i].lang)) { vozPtBr = vozes[i]; break; }
    }
    if (!vozPtBr) {
        for (let i = 0; i < vozes.length; i++) {
            if (/^pt/i.test(vozes[i].lang)) { vozPtBr = vozes[i]; break; }
        }
    }
}
if (sintese) {
    carregarVoz();
    sintese.addEventListener('voiceschanged', carregarVoz);
}

// --- Desbloqueio no primeiro toque -----------------------------------
// iOS e Android só liberam áudio e fala dentro de um gesto do usuário
let vozDesbloqueada = false;

function desbloquearVoz() {
    if (vozDesbloqueada) return;
    vozDesbloqueada = true;

    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    if (!sintese) return;
    try {
        const mudo = new SpeechSynthesisUtterance(' ');
        mudo.volume = 0;
        sintese.speak(mudo);
    } catch (e) {}
}

['pointerdown', 'touchstart', 'keydown'].forEach(function (evento) {
    document.addEventListener(evento, desbloquearVoz, { once: true, passive: true });
});

// --- Quebra do texto em trechos curtos -------------------------------
function dividirEmTrechos(texto) {
    const limpo  = texto.replace(/\s+/g, ' ').trim();
    const frases = limpo.match(/[^.!?;:]+[.!?;:]*\s*/g) || [limpo];
    const saida  = [];
    let   buffer = '';

    frases.forEach(function (fraseOriginal) {
        let frase = fraseOriginal;

        // Frase sozinha maior que o limite: corta no espaço mais próximo
        while (frase.length > MAX_TRECHO) {
            let corte = frase.lastIndexOf(' ', MAX_TRECHO);
            if (corte <= 0) corte = MAX_TRECHO;
            if (buffer.trim()) { saida.push(buffer.trim()); buffer = ''; }
            saida.push(frase.slice(0, corte).trim());
            frase = frase.slice(corte);
        }

        if ((buffer + frase).length > MAX_TRECHO) {
            if (buffer.trim()) saida.push(buffer.trim());
            buffer = frase;
        } else {
            buffer += frase;
        }
    });

    if (buffer.trim()) saida.push(buffer.trim());
    return saida.filter(function (t) { return t.length > 0; });
}

// --- Motor de leitura -------------------------------------------------
function pararMotor() {
    geracao++;
    try { sintese.cancel(); } catch (e) {}
}

function falarTrecho(indice, offset, g) {
    if (g !== geracao || !lendo) return;

    if (indice >= trechos.length) {
        finalizarLeitura(true);
        return;
    }

    trechoAtual    = indice;
    offsetNoTrecho = offset || 0;

    const texto = trechos[indice].slice(offsetNoTrecho);
    if (!texto.trim()) {
        falarTrecho(indice + 1, 0, g);
        return;
    }

    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = 'pt-BR';
    if (vozPtBr) fala.voice = vozPtBr;
    fala.rate = getVelocidade();

    const base = offsetNoTrecho;
    fala.addEventListener('boundary', function (e) {
        if (e.name === 'word') offsetNoTrecho = base + e.charIndex;
    });

    fala.addEventListener('end', function () {
        if (g !== geracao || !lendo) return;
        falarTrecho(indice + 1, 0, g);
    });

    fala.addEventListener('error', function (e) {
        // "interrupted" e "canceled" são esperados quando pausamos ou paramos
        if (g !== geracao || !lendo) return;
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        finalizarLeitura(false);
        mostrarStatus('⚠ Não foi possível ler em voz alta neste aparelho');
    });

    sintese.speak(fala);
}

// Todo speak() precisa de uma folga depois do cancel(), senão o celular
// engasga e não fala nada
function agendarFala(indice, offset) {
    pararMotor();
    const g = geracao;
    setTimeout(function () {
        if (g !== geracao || !lendo) return;
        falarTrecho(indice, offset, g);
    }, 120);
}

function finalizarLeitura(completou) {
    lendo          = false;
    isPaused       = false;
    trechos        = [];
    trechoAtual    = 0;
    offsetNoTrecho = 0;
    atualizarEstadoBotoes();
    if (completou) mostrarStatus('✓ Leitura concluída');
}

function atualizarEstadoBotoes() {
    const play  = document.querySelector('.btn-play');
    const pause = document.querySelector('.btn-pause');

    if (play) {
        play.classList.toggle('is-speaking', lendo);
        play.setAttribute('aria-pressed', String(lendo));
        play.textContent = lendo ? '🔊 Lendo...' : '▶ Ouvir Página';
    }
    if (pause) {
        pause.textContent = isPaused ? '▶ Retomar' : '⏸ Pausar';
    }
}

// --- Ações dos botões -------------------------------------------------
function lerTexto() {
    desbloquearVoz();
    feedbackToque('play');

    if (!sintese) {
        mostrarStatus('⚠ Este navegador não suporta leitura em voz alta');
        return;
    }

    // Se estava pausado, retoma de onde parou em vez de recomeçar
    if (isPaused && trechos.length) {
        isPaused = false;
        lendo    = true;
        atualizarEstadoBotoes();
        mostrarStatus('▶ Retomando leitura...');
        agendarFala(trechoAtual, offsetNoTrecho);
        return;
    }

    const alvo = document.getElementById('main-content') || document.body;
    trechos        = dividirEmTrechos(alvo.innerText || '');
    trechoAtual    = 0;
    offsetNoTrecho = 0;

    if (!trechos.length) {
        mostrarStatus('⚠ Nada para ler nesta página');
        return;
    }

    lendo    = true;
    isPaused = false;
    atualizarEstadoBotoes();
    mostrarStatus('▶ Lendo a página...');
    agendarFala(0, 0);
}

function pausarTexto() {
    desbloquearVoz();
    feedbackToque('pause');

    if (lendo && !isPaused) {
        lendo    = false;
        isPaused = true;
        pararMotor();
        atualizarEstadoBotoes();
        mostrarStatus('⏸ Leitura pausada');
    } else if (isPaused) {
        isPaused = false;
        lendo    = true;
        atualizarEstadoBotoes();
        mostrarStatus('▶ Retomando leitura...');
        agendarFala(trechoAtual, offsetNoTrecho);
    } else {
        mostrarStatus('Nada sendo lido no momento');
    }
}

function pararTexto() {
    desbloquearVoz();
    feedbackToque('stop');

    const estavaAtivo = lendo || isPaused;
    lendo    = false;
    isPaused = false;
    pararMotor();
    finalizarLeitura(false);
    mostrarStatus(estavaAtivo ? '⏹ Leitura parada' : 'Nada sendo lido no momento');
}

// =====================================================
// CONTROLE DE VELOCIDADE
// =====================================================
function aumentarVelocidade() {
    desbloquearVoz();
    feedbackToque('speed');
    if (velocidadeIndex >= VELOCIDADES.length - 1) {
        mostrarStatus('⚡ Velocidade máxima');
        return;
    }
    velocidadeIndex++;
    mostrarVelocidade();
    reiniciarComNovaVelocidade();
}

function diminuirVelocidade() {
    desbloquearVoz();
    feedbackToque('speed');
    if (velocidadeIndex <= 0) {
        mostrarStatus('⚡ Velocidade mínima');
        return;
    }
    velocidadeIndex--;
    mostrarVelocidade();
    reiniciarComNovaVelocidade();
}

function reiniciarComNovaVelocidade() {
    // Se estiver lendo ou pausado, retoma do ponto atual com a nova velocidade
    if (!lendo && !isPaused) return;
    const indice = trechoAtual;
    const offset = offsetNoTrecho;
    isPaused = false;
    lendo    = true;
    atualizarEstadoBotoes();
    agendarFala(indice, offset);
}

// 1 vira "1.0×" em vez de "1×"
function rotuloVelocidade(v) {
    return (Number.isInteger(v) ? v.toFixed(1) : String(v)) + '×';
}

function mostrarVelocidade() {
    const velocidade = getVelocidade();

    // Atualiza o display inline no painel de voz
    const display = document.getElementById('speed-display');
    if (display) display.textContent = rotuloVelocidade(velocidade);

    const label = velocidade === 1.0 ? '1.0× (normal)' : rotuloVelocidade(velocidade);
    mostrarStatus('⚡ Velocidade: ' + label);
}

// Inicializa o display ao carregar
document.addEventListener('DOMContentLoaded', function () {
    const display = document.getElementById('speed-display');
    if (display) display.textContent = rotuloVelocidade(getVelocidade());
    atualizarEstadoBotoes();
});

// Se a pessoa sair da aba ou fechar, interrompe a fala
window.addEventListener('pagehide', function () { pararMotor(); });

// =====================================================
// TOAST DE STATUS (feedback visual e de leitor de tela)
// =====================================================
function mostrarStatus(mensagem) {
    let toast = document.getElementById('voice-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'voice-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    toast.textContent = mensagem;
    toast.classList.add('visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
        toast.classList.remove('visible');
    }, 2500);
}

// =====================================================
// MODO ACESSIBILIDADE (alto contraste)
// =====================================================
function toggleModoAcessibilidade() {
    const html  = document.documentElement;
    const btn   = document.getElementById('btn-mode-toggle');
    const label = btn && btn.querySelector('.mode-label');
    const isAtivo = html.dataset.mode === 'acessibilidade';

    feedbackToque('speed');

    if (isAtivo) {
        delete html.dataset.mode;
        if (btn)   btn.setAttribute('aria-label', 'Ativar modo de alto contraste');
        if (label) label.textContent = 'Modo Acessibilidade';
        localStorage.removeItem('ifa-modo-acessibilidade');
    } else {
        html.dataset.mode = 'acessibilidade';
        if (btn)   btn.setAttribute('aria-label', 'Desativar modo de alto contraste');
        if (label) label.textContent = 'Modo Normal';
        localStorage.setItem('ifa-modo-acessibilidade', '1');
    }
}

// Restaura preferência salva
(function restaurarModo() {
    if (localStorage.getItem('ifa-modo-acessibilidade') === '1') {
        document.documentElement.dataset.mode = 'acessibilidade';
        document.addEventListener('DOMContentLoaded', function () {
            const btn   = document.getElementById('btn-mode-toggle');
            const label = btn && btn.querySelector('.mode-label');
            if (btn)   btn.setAttribute('aria-label', 'Desativar modo de alto contraste');
            if (label) label.textContent = 'Modo Normal';
        });
    }
})();

// =====================================================
// MENU MOBILE
// =====================================================
function toggleMobileMenu() {
    const dropdown = document.getElementById('mobile-dropdown');
    const btn      = document.getElementById('btn-hamburger');
    const isAberto = dropdown.classList.contains('open');
    dropdown.classList.toggle('open');
    dropdown.setAttribute('aria-hidden', String(isAberto));
    btn.setAttribute('aria-expanded', String(!isAberto));
}

function closeMobileMenu() {
    const dropdown = document.getElementById('mobile-dropdown');
    const btn      = document.getElementById('btn-hamburger');
    dropdown.classList.remove('open');
    dropdown.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('mobile-dropdown');
    const btn      = document.getElementById('btn-hamburger');
    if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        closeMobileMenu();
    }
});

// =====================================================
// ATALHOS DE TECLADO
// =====================================================
document.addEventListener('keydown', function (event) {
    if (!event.altKey) return;

    switch (event.key) {
        // --- Leitura de voz ---
        case 'p': case 'P':
            event.preventDefault();
            lerTexto();
            break;
        case 's': case 'S':
            event.preventDefault();
            pausarTexto();
            break;
        case 'x': case 'X':
            event.preventDefault();
            pararTexto();
            break;

        // --- Modo Acessibilidade ---
        case 'a': case 'A':
            event.preventDefault();
            toggleModoAcessibilidade();
            mostrarStatus(document.documentElement.dataset.mode === 'acessibilidade' ? '♿ Modo acessibilidade ativado' : '☀ Modo normal ativado');
            break;

        // --- Velocidade ---
        case '.':
            event.preventDefault();
            aumentarVelocidade();
            break;
        case ',':
            event.preventDefault();
            diminuirVelocidade();
            break;

        // --- Navegação entre seções ---
        case '1':
            event.preventDefault();
            navegarPara('boas-vindas');
            break;
        case '2':
            event.preventDefault();
            navegarPara('intro');
            break;
        case '3':
            event.preventDefault();
            navegarPara('dificuldades');
            break;
        case '4':
            event.preventDefault();
            navegarPara('conclusao');
            break;
    }
});

function navegarPara(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        el.focus();
    }
}

// =====================================================
// FIREBASE / FIRESTORE
// =====================================================
const firebaseConfig = {
    apiKey:            'AIzaSyBrf8nIWVrPnYDYEd0jl_-i1C0Ncdz4XlY',
    authDomain:        'acessebilidade-na-educacao.firebaseapp.com',
    projectId:         'acessebilidade-na-educacao',
    storageBucket:     'acessebilidade-na-educacao.firebasestorage.app',
    messagingSenderId: '272079576150',
    appId:             '1:272079576150:web:0feae20eddddd55cdaaff7'
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// =====================================================
// FORMULÁRIO DE OPINIÃO
// =====================================================
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

function renderOpinioes(docs) {
    const container = document.getElementById('opinions-container');
    if (!container) return;

    if (docs.length === 0) {
        container.innerHTML = '<p class="no-opinions">Ainda não há mensagens. Seja o primeiro a contribuir!</p>';
        return;
    }

    container.innerHTML = docs.map(function (op) {
        return '<div class="opinion-item" role="article">'
            + '<div class="opinion-author">' + escapeHtml(op.nome || 'Anônimo') + '</div>'
            + '<div>' + escapeHtml(op.texto) + '</div>'
            + '<div class="opinion-date">' + escapeHtml(op.data) + '</div>'
            + '</div>';
    }).join('');
}

function carregarOpinioes() {
    const container = document.getElementById('opinions-container');
    if (!container) return;

    db.collection('feedbacks')
        .orderBy('timestamp', 'desc')
        .onSnapshot(function (snapshot) {
            renderOpinioes(snapshot.docs.map(function (d) { return d.data(); }));
        }, function () {
            // Fallback local se Firestore não carregar
            const local = JSON.parse(localStorage.getItem('ifa-opinioes') || '[]').slice().reverse();
            renderOpinioes(local);
        });
}

function enviarOpiniao(event) {
    event.preventDefault();

    const nome     = document.getElementById('nome-input').value.trim();
    const texto    = document.getElementById('opiniao-input').value.trim();
    const feedback = document.getElementById('form-feedback');

    if (!texto) {
        feedback.textContent = 'Por favor, escreva sua mensagem antes de enviar.';
        feedback.className   = 'form-feedback error';
        document.getElementById('opiniao-input').focus();
        return;
    }

    const opiniao = {
        nome:      nome || 'Anônimo',
        texto:     texto,
        data:      new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    db.collection('feedbacks').add(opiniao)
        .then(function () {
            // Também envia para Netlify Forms para notificação por email
            fetch('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    'form-name': 'feedbacks',
                    'nome':      opiniao.nome,
                    'mensagem':  opiniao.texto
                }).toString()
            }).catch(function () {});

            document.getElementById('form-opiniao').reset();
            feedback.textContent = '✓ Mensagem enviada! Obrigado pela sua contribuição.';
            feedback.className   = 'form-feedback success';
            setTimeout(function () {
                feedback.textContent = '';
                feedback.className   = 'form-feedback';
            }, 6000);
        })
        .catch(function () {
            feedback.textContent = '⚠ Não foi possível enviar. Tente novamente.';
            feedback.className   = 'form-feedback error';
        });
}

document.addEventListener('DOMContentLoaded', carregarOpinioes);
