// --- SÍNTESE DE VOZ (LEITOR DE TELA EMBUTIDO) ---
const sintese = window.speechSynthesis;
let utterance = null;

function lerTexto() {
    sintese.cancel(); // Para leituras anteriores pendentes

    // Obtém todo o texto do conteúdo principal
    const textoParaLer = document.querySelector('main').innerText;

    utterance = new SpeechSynthesisUtterance(textoParaLer);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.0; // Velocidade normal de leitura

    sintese.speak(utterance);
}

function pausarTexto() {
    if (sintese.speaking && !sintese.paused) {
        sintese.pause();
    } else if (sintese.paused) {
        sintese.resume();
    }
}

function pararTexto() {
    if (sintese.speaking) {
        sintese.cancel();
    }
}

// --- ATALHOS DE TECLADO ---
document.addEventListener('keydown', function(event) {
    // Tecla Alt + P: Play / Iniciar Leitura
    if (event.altKey && (event.key === 'p' || event.key === 'P')) {
        event.preventDefault();
        lerTexto();
    }
    
    // Tecla Alt + S: Pause / Pausar Leitura
    if (event.altKey && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        pausarTexto();
    }

    // Tecla Alt + X: Stop / Parar Leitura
    if (event.altKey && (event.key === 'x' || event.key === 'X')) {
        event.preventDefault();
        pararTexto();
    }

    // Atalhos de navegação por seções (Alt + 1, Alt + 2, Alt + 3, Alt + 4)
    if (event.altKey && event.key === '1') {
        document.getElementById('intro').focus();
    }
    if (event.altKey && event.key === '2') {
        document.getElementById('dificuldades').focus();
    }
    if (event.altKey && event.key === '3') {
        document.getElementById('conclusao').focus();
    }
    if (event.altKey && event.key === '4') {
        document.getElementById('fontes').focus();
    }
});