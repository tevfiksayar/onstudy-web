let timerInterval = null;
let secondsElapsed = 0;
let isRunning = false;
let isPomodoro = false;
const POMODORO_SECONDS = 25 * 60; 

const timeDisplay = document.getElementById('time-display');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const subjectInput = document.getElementById('subject-input');

window.setTimerMode = function(mode) {
    if (isRunning) {
        if(window.showCustomDialog) {
            showCustomDialog("Uyarı", "Lütfen mod değiştirmeden önce mevcut sayacı durdurun veya bitirin.", "✋", "Tamam", "var(--accent-orange)", null);
        }
        return;
    }
    
    isPomodoro = (mode === 'pomodoro');
    document.getElementById('mode-stopwatch').classList.toggle('active', !isPomodoro);
    document.getElementById('mode-pomodoro').classList.toggle('active', isPomodoro);
    
    resetTimerUI();
};

function updateDisplay() {
    let displaySecs = isPomodoro ? (POMODORO_SECONDS - secondsElapsed) : secondsElapsed;
    if (displaySecs < 0) displaySecs = 0;
    
    const h = Math.floor(displaySecs / 3600);
    const m = Math.floor((displaySecs % 3600) / 60);
    const s = displaySecs % 60;
    
    if (isPomodoro) {
        timeDisplay.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    } else {
        timeDisplay.textContent = (h > 0 ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
}

function resetTimerUI() {
    clearInterval(timerInterval);
    isRunning = false;
    secondsElapsed = 0;
    startBtn.textContent = "Çalışmaya Başla"; 
    updateDisplay();
}

startBtn.addEventListener('click', () => {
    if (!subjectInput.value.trim()) {
        if(window.showCustomDialog) {
            showCustomDialog("Ders Adı Eksik", "Lütfen başlamadan önce hangi derse çalıştığını yaz.", "✏️", "Tamam", "var(--primary-purple)", () => subjectInput.focus());
        }
        return;
    }
    if (isRunning) return;
    
    isRunning = true;
    startBtn.textContent = "Devam Ediyor..."; 
    
    // charts.js içindeki kütüphaneye giriş fonksiyonunu çağır
    if(window.joinLiveRoom) window.joinLiveRoom(subjectInput.value.trim());
    
    timerInterval = setInterval(() => {
        secondsElapsed++;
        updateDisplay();
        
        if (isPomodoro && secondsElapsed >= POMODORO_SECONDS) {
            clearInterval(timerInterval);
            isRunning = false;
            
            if(window.leaveLiveRoom) window.leaveLiveRoom(); 

            if(window.showCustomDialog) {
                showCustomDialog("Pomodoro Bitti!", "Harika odaklandın! 25 dakikalık seansın bitti. Kaydedip mola verebilirsin.", "🍅", "Kaydet", "var(--accent-orange)", () => saveSession());
            } else {
                saveSession();
            }
        }
    }, 1000);
});

pauseBtn.addEventListener('click', () => {
    if (!isRunning) return;
    clearInterval(timerInterval);
    isRunning = false;
    startBtn.textContent = "Devam Et"; 
    
    if(window.leaveLiveRoom) window.leaveLiveRoom();
});

stopBtn.addEventListener('click', () => {
    if(window.leaveLiveRoom) window.leaveLiveRoom();
    
    if (secondsElapsed < 10 && !isPomodoro) { 
         resetTimerUI();
         return;
    }
    saveSession();
});

async function saveSession() {
    if (secondsElapsed === 0) return;
    
    const sessionData = {
        userId: firebase.auth().currentUser.uid,
        subject: subjectInput.value.trim(),
        durationInSeconds: secondsElapsed,
        date: new Date().toISOString()
    };

    try {
        await fetch("http://localhost:5195/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sessionData)
        });
        subjectInput.value = '';
        resetTimerUI();
        
        if(window.showCustomDialog) {
            showCustomDialog("Başarılı!", "Çalışma kaydın eklendi ve istatistiklerine yansıdı.", "✅", "Süper", "var(--primary-purple)", () => location.reload());
        } else {
            location.reload();
        }
    } catch (error) {
        console.error("Kaydetme hatası:", error);
    }
}

// Sekme kapandığında çıkış yap
window.addEventListener('beforeunload', () => {
    if(window.leaveLiveRoom) window.leaveLiveRoom();
});
// --- YENİ: DAHİLİ ODAK SESLERİ YÖNETİMİ ---
const sounds = {
    rain: new Audio("https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3"), // Ücretsiz yağmur sesi
    cafe: new Audio("https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3"), // Ücretsiz kafe sesi
    fire: new Audio("https://cdn.pixabay.com/download/audio/2022/02/22/audio_fc1b09cbda.mp3")  // Ücretsiz şömine sesi
};

// Sesleri sürekli tekrar edecek (loop) şekilde ayarla
Object.values(sounds).forEach(audio => {
    audio.loop = true;
    audio.volume = 0.5; // Ses seviyesi %50
});

let currentSound = null;

window.toggleSound = function(soundName) {
    const btn = document.getElementById(`btn-sound-${soundName}`);
    const audio = sounds[soundName];

    // Eğer tıklanan ses zaten çalıyorsa, durdur
    if (currentSound === soundName) {
        audio.pause();
        currentSound = null;
        btn.style.background = "rgba(255,255,255,0.03)";
        btn.style.borderColor = "rgba(255,255,255,0.1)";
        return;
    }

    // Başka bir ses çalıyorsa önce onu sustur ve butonları sıfırla
    if (currentSound) {
        sounds[currentSound].pause();
        document.getElementById(`btn-sound-${currentSound}`).style.background = "rgba(255,255,255,0.03)";
        document.getElementById(`btn-sound-${currentSound}`).style.borderColor = "rgba(255,255,255,0.1)";
    }

    // Yeni sesi başlat ve butonunu mor renkle (aktif) vurgula
    audio.play().catch(e => console.log("Tarayıcı otomatik ses çalmayı engelledi:", e));
    currentSound = soundName;
    btn.style.background = "rgba(124, 58, 237, 0.2)"; // Mor arkaplan
    btn.style.borderColor = "var(--primary-purple)"; // Mor kenarlık
};

// Sayfa kapanırken veya mola verildiğinde sesi de durdurmak istersek:
// (İsteğe bağlı: stopBtn.addEventListener içine `if(currentSound) sounds[currentSound].pause();` ekleyebilirsin)
updateDisplay();