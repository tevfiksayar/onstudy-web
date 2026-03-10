let startTime = 0;
let elapsedTime = 0;
let timerInterval;

const timeDisplay = document.getElementById('time-display');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const subjectInput = document.getElementById('subject-input');

pauseBtn.disabled = true;
stopBtn.disabled = true;

function formatTime(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    let hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    let minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    let seconds = String(totalSeconds % 60).padStart(2, '0');
    
    return `${hours}:${minutes}:${seconds}`;
}

function updateTime() {
    const currentTime = Date.now();
    const timeDiff = currentTime - startTime + elapsedTime;
    timeDisplay.textContent = formatTime(timeDiff);
}

// 1. START BUTTON
startBtn.addEventListener('click', () => {
    if (subjectInput.value.trim() === '') {
        alert("Please enter a subject name before starting!");
        return;
    }

    startTime = Date.now();
    timerInterval = setInterval(updateTime, 1000);

    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    subjectInput.disabled = true;
});

// 2. PAUSE BUTTON
pauseBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    elapsedTime += Date.now() - startTime;

    startBtn.disabled = false;
    pauseBtn.disabled = true;
});

// 3. STOP & SAVE BUTTON
stopBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    
    if (startBtn.disabled) {
        elapsedTime += Date.now() - startTime;
    }

    const totalWorkedSeconds = Math.floor(elapsedTime / 1000);
    const subject = subjectInput.value.trim();

   // The JSON payload to be sent to the .NET backend
    const sessionData = {
        userId: firebase.auth().currentUser.uid, // YENİ EKLENDİ (Firebase'den kimliği alır)
        subject: subject,
        durationInSeconds: totalWorkedSeconds,
        date: new Date().toISOString()
    };

    console.log("Data ready to be sent to backend:", sessionData);

    // 🚀 SEND DATA TO .NET BACKEND
    // UYARI: Terminalde dotnet run dediğinde çıkan port numarasıyla eşleştiğinden emin ol!
    const backendUrl = "http://localhost:5195/api/sessions";

    fetch(backendUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(sessionData)
    })
    .then(response => response.json())
    .then(data => {
        alert("Success! " + data.message);
        
        // 🚀 İŞTE SİHİRLİ DOKUNUŞ BURADA:
        // Veri başarıyla kaydedildikten hemen sonra grafikleri ve listeyi yenile!
        if (typeof window.loadDashboardData === "function") {
            window.loadDashboardData();
        }
    })
    .catch(error => {
        console.error("Error sending data to backend:", error);
        alert("Error saving session!");
    });

    // Yeni oturum için her şeyi sıfırla
    elapsedTime = 0;
    timeDisplay.textContent = "00:00:00";
    subjectInput.value = '';
    
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    subjectInput.disabled = false;
});