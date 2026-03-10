const backendBaseUrl = "http://localhost:5195/api/sessions/";
const backendUsersUrl = "http://localhost:5195/api/users/";
const backendLeaderboardUrl = "http://localhost:5195/api/leaderboard";
let studyChartInstance = null; 
let currentUserUid = null;
let currentDisplayName = null;
let userProfile = null;

// Firebase kullanıcı kontrolü
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        currentUserUid = user.uid; 
        currentDisplayName = user.email.split('@')[0]; // Varsayılan isim (mailin başı)
        initUserAndLoadData(); 
    }
});

// 1. KULLANICIYI BAŞLAT VE VERİLERİ ÇEK
async function initUserAndLoadData() {
    if (!currentUserUid) return;

    try {
        const profileResponse = await fetch(backendUsersUrl + currentUserUid);
        
        if (profileResponse.status === 404) {
            openProfileModal(true);
        } else {
            userProfile = await profileResponse.json();
            currentDisplayName = userProfile.displayName || currentDisplayName;
            document.getElementById('user-name').textContent = currentDisplayName;

            const sessionsResponse = await fetch(backendBaseUrl + currentUserUid);
            const sessionsData = await sessionsResponse.json();

            updateRecentSessions(sessionsData);
            updateChart(sessionsData);
            checkStreak(sessionsData);
            loadLeaderboard();
        }
    } catch (error) {
        console.error("Veriler çekilirken hata:", error);
    }
}

// ---------------------------------------------------------
// PROFiL AYARLARI MENÜSÜ (MODAL) YÖNETİMİ
// ---------------------------------------------------------
const profileModal = document.getElementById('profile-modal');
const profileBtn = document.getElementById('profile-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalName = document.getElementById('modal-name');
const modalHours = document.getElementById('modal-hours');
const modalMinutes = document.getElementById('modal-minutes');

profileBtn.addEventListener('click', () => openProfileModal(false));
modalCancelBtn.addEventListener('click', () => profileModal.style.display = 'none');

function openProfileModal(isNewUser) {
    profileModal.style.display = 'flex'; 
    
    if (isNewUser) {
        modalCancelBtn.style.display = 'none'; 
        modalName.value = currentDisplayName;
        modalHours.value = 0;
        modalMinutes.value = 10; 
    } else {
        modalCancelBtn.style.display = 'block';
        modalName.value = userProfile.displayName;
        let h = Math.floor(userProfile.dailyGoalSeconds / 3600);
        let m = Math.floor((userProfile.dailyGoalSeconds % 3600) / 60);
        modalHours.value = h;
        modalMinutes.value = m;
    }
}

// KAYDET BUTONUNA TIKLANINCA
modalSaveBtn.addEventListener('click', async () => {
    let h = parseInt(modalHours.value) || 0;
    let m = parseInt(modalMinutes.value) || 0;
    if (h === 0 && m === 0) m = 10; 

    let goalSecs = (h * 3600) + (m * 60);
    let newName = modalName.value.trim() || currentDisplayName;

    userProfile = {
        userId: currentUserUid,
        displayName: newName,
        dailyGoalSeconds: goalSecs,
        streakCount: userProfile ? userProfile.streakCount : 0,
        lastGoalMetDate: userProfile ? userProfile.lastGoalMetDate : ""
    };

    await fetch(backendUsersUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userProfile)
    });

    profileModal.style.display = 'none'; 
    location.reload(); 
});
// ---------------------------------------------------------

// 2. LİDERLİK TABLOSUNU DOLDURMA (DARK TEMA UYUMLU)
async function loadLeaderboard() {
    try {
        const response = await fetch(backendLeaderboardUrl);
        const leaders = await response.json();
        const leaderboardList = document.getElementById('leaderboard-list');
        if(!leaderboardList) return;
        
        leaderboardList.innerHTML = '';
        leaderboardList.style.listStyleType = "none";
        leaderboardList.style.padding = "0";

        leaders.forEach((leader, index) => {
            const li = document.createElement('li');
            let totalSecs = leader.totalSeconds;
            let h = Math.floor(totalSecs / 3600);
            let m = Math.floor((totalSecs % 3600) / 60);
            let s = totalSecs % 60;
            
            let timeStr = "";
            if (h > 0) timeStr += `${h}h `;
            if (m > 0 || h > 0) timeStr += `${m}m `;
            timeStr += `${s}s`;

            let rankMedal = `${index + 1}.`;
            if (index === 0) rankMedal = "🥇";
            if (index === 1) rankMedal = "🥈";
            if (index === 2) rankMedal = "🥉";

            const isMe = leader.displayName === currentDisplayName;

            li.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; font-size: 1.1em; color: ${isMe ? '#c084fc' : '#e2e8f0'};">
                        ${rankMedal} ${leader.displayName} ${isMe ? '(Sen)' : ''}
                    </span>
                    <span style="background-color: ${isMe ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.1)'}; color: ${isMe ? '#e9d5ff' : '#cbd5e1'}; padding: 4px 10px; border-radius: 20px; font-weight: bold; font-size: 0.9em; border: 1px solid ${isMe ? 'rgba(168, 85, 247, 0.4)' : 'transparent'};">
                        ${timeStr}
                    </span>
                </div>
            `;
            
            li.style.background = isMe ? "rgba(168, 85, 247, 0.1)" : "rgba(15, 23, 42, 0.6)";
            li.style.margin = "10px 0";
            li.style.padding = "15px";
            li.style.borderRadius = "10px";
            li.style.border = isMe ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid rgba(255, 255, 255, 0.05)";
            leaderboardList.appendChild(li);
        });
    } catch(err) {
        console.error("Liderlik tablosu hatası:", err);
    }
}

// 3. STREAK (ATEŞ) KONTROL MANTIĞI
async function checkStreak(sessions) {
    if (!userProfile) return;
    const todayStr = new Date().toLocaleDateString();
    let todayTotalSeconds = 0;

    sessions.forEach(session => {
        const sessionDate = new Date(session.date).toLocaleDateString();
        if (sessionDate === todayStr) {
            todayTotalSeconds += session.durationInSeconds;
        }
    });

    if (todayTotalSeconds >= userProfile.dailyGoalSeconds && userProfile.lastGoalMetDate !== todayStr) {
        userProfile.streakCount += 1;
        userProfile.lastGoalMetDate = todayStr;
        await fetch(backendUsersUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(userProfile)
        });
    }

    const streakDisplay = document.getElementById('streak-display');
    let goalH = Math.floor(userProfile.dailyGoalSeconds / 3600);
    let goalM = Math.floor((userProfile.dailyGoalSeconds % 3600) / 60);
    let goalStr = goalH > 0 ? `${goalH} Saat ${goalM} Dk` : `${goalM} Dk`;

    if (userProfile.streakCount > 0) {
        streakDisplay.textContent = `${userProfile.streakCount} (Hedef: ${goalStr})`;
    } else {
        streakDisplay.textContent = `Hedef: ${goalStr}`;
    }
}

// 4. MODERN "RECENT SESSIONS" (DARK TEMA UYUMLU)
function updateRecentSessions(sessions) {
    const sessionList = document.getElementById('session-list');
    sessionList.innerHTML = ''; 
    sessionList.style.listStyleType = "none";
    sessionList.style.padding = "0";
    if (sessions.length === 0) return;

    sessions.forEach(session => {
        const li = document.createElement('li');
        const mins = Math.floor(session.durationInSeconds / 60);
        const secs = session.durationInSeconds % 60;
        const timeString = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        const dateObj = new Date(session.date);
        const dateString = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; font-size: 1.1em; color: #e2e8f0;"> ${session.subject}</span>
                <span style="background-color: rgba(99, 102, 241, 0.2); color: #c7d2fe; padding: 4px 10px; border-radius: 20px; font-weight: bold; font-size: 0.9em; border: 1px solid rgba(99, 102, 241, 0.3);">⏱️ ${timeString}</span>
            </div>
            <div style="margin-top: 5px; font-size: 0.8em; color: #94a3b8;">📅 ${dateString}</div>
        `;
        li.style.background = "rgba(15, 23, 42, 0.6)";
        li.style.margin = "10px 0";
        li.style.padding = "15px";
        li.style.borderRadius = "10px";
        li.style.border = "1px solid rgba(255, 255, 255, 0.05)";
        li.style.borderLeft = "5px solid #a855f7"; // Neon mor sol çizgi
        sessionList.appendChild(li);
    });
}

// 5. GRAFİK (DARK TEMA UYUMLU)
function updateChart(sessions) {
    const subjectTotals = {};
    sessions.forEach(session => {
        if (!subjectTotals[session.subject]) {
            subjectTotals[session.subject] = 0;
        }
        subjectTotals[session.subject] += session.durationInSeconds;
    });

    const labels = Object.keys(subjectTotals);
    const dataInSeconds = Object.values(subjectTotals); 
    const ctx = document.getElementById('studyChart').getContext('2d');
    if (studyChartInstance) studyChartInstance.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(168, 85, 247, 0.8)'); // Daha parlak mor
    gradient.addColorStop(1, 'rgba(168, 85, 247, 0.1)'); 

    studyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Study Time (Seconds)', 
                data: dataInSeconds,
                backgroundColor: gradient,
                hoverBackgroundColor: 'rgba(192, 132, 252, 1)',
                borderRadius: 8,
                borderSkipped: false,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#e2e8f0',
                    bodyColor: '#e2e8f0',
                    padding: 12,
                    callbacks: { label: function(context) { return context.raw + ' Saniye'; } }
                }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    grid: { borderDash: [5, 5], color: 'rgba(255, 255, 255, 0.1)' }, // Grafik arka plan çizgileri soluklaştırıldı
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' }, // Rakamlar beyaza yakın yapıldı
                    border: { display: false } 
                },
                x: { 
                    grid: { display: false }, 
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                    border: { display: false } 
                }
            }
        }
    });
}

window.loadDashboardData = initUserAndLoadData;