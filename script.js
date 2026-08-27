// =====================================================
// SÍNTESE DE VOZ — com workaround do bug de pause do Chrome
// =====================================================
const sintese = window.speechSynthesis;
let utterance      = null;
let textoCompleto  = '';
let charIndexAtual = 0;   // posição da última palavra lida
let isPaused       = false;

// Velocidades disponíveis e índice atual (padrão: 1.0×)
const VELOCIDADES   = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
let velocidadeIndex = 2;

function getVelocidade() {
    return VELOCIDADES[velocidadeIndex];
}

// Inicia (ou retoma) a leitura a partir de um offset de caracteres
function lerTexto(from) {
    from = from || 0;
    sintese.cancel();

    // Carrega o texto apenas na primeira chamada
    if (from === 0 || !textoCompleto) {
        textoCompleto  = document.getElementById('main-content').innerText;
        charIndexAtual = 0;
    }

    const trecho = textoCompleto.slice(from);
    utterance = new SpeechSynthesisUtterance(trecho);
    utterance.lang = 'pt-BR';
    utterance.rate = getVelocidade();

    // Rastreia a posição palavra a palavra (workaround para o bug de pause do Chrome)
    utterance.addEventListener('boundary', function (e) {
        if (e.name === 'word') {
            charIndexAtual = from + e.charIndex;
        }
    });

    utterance.addEventListener('end', function () {
        charIndexAtual = 0;
        textoCompleto  = '';
        isPaused       = false;
    });

    isPaused = false;
    sintese.speak(utterance);
}

function pausarTexto() {
    if (sintese.speaking && !isPaused) {
        // Chrome não implementa pause corretamente: cancela e salva a posição
        sintese.cancel();
        isPaused = true;
        mostrarStatus('⏸ Pausado');
    } else if (isPaused) {
        lerTexto(charIndexAtual);
        mostrarStatus('▶ Retomando...');
    }
}

function pararTexto() {
    sintese.cancel();
    charIndexAtual = 0;
    textoCompleto  = '';
    isPaused       = false;
    mostrarStatus('⏹ Parado');
}

// =====================================================
// CONTROLE DE VELOCIDADE
// =====================================================
function aumentarVelocidade() {
    if (velocidadeIndex >= VELOCIDADES.length - 1) return;
    velocidadeIndex++;
    mostrarVelocidade();
    reiniciarComNovaVelocidade();
}

function diminuirVelocidade() {
    if (velocidadeIndex <= 0) return;
    velocidadeIndex--;
    mostrarVelocidade();
    reiniciarComNovaVelocidade();
}

function reiniciarComNovaVelocidade() {
    // Se estiver lendo ou pausado, retoma do ponto atual com a nova velocidade
    if (sintese.speaking || isPaused) {
        const from = charIndexAtual;
        isPaused   = false;
        lerTexto(from);
    }
}

function mostrarVelocidade() {
    const velocidade = getVelocidade();

    // Atualiza o display inline no painel de voz
    const display = document.getElementById('speed-display');
    if (display) display.textContent = velocidade + '×';

    const label = velocidade === 1.0 ? '1.0× (normal)' : velocidade + '×';
    mostrarStatus('⚡ Velocidade: ' + label);
}

// Inicializa o display ao carregar
document.addEventListener('DOMContentLoaded', function () {
    const display = document.getElementById('speed-display');
    if (display) display.textContent = getVelocidade() + '×';
});

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
            lerTexto(0);
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
