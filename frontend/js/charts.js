const backendBaseUrl = "https://onstudy-api.onrender.com/api/sessions/";
const backendUsersUrl = "https://onstudy-api.onrender.com/api/users/";
const backendLeaderboardUrl = "https://onstudy-api.onrender.com/api/leaderboard/";
const backendTodoUrl = "https://onstudy-api.onrender.com/api/todos/";

// İki ayrı grafik için iki ayrı referans
let dailyChartInstance = null; 
let weeklyChartInstance = null; 

let currentUserUid = null;
let currentDisplayName = null;
let userProfile = null;
window.cachedSessions = []; // Takvimden gün değişince veriyi tekrar çekmemek için

let selectedDateStr = new Date().toLocaleDateString('en-CA');

firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        currentUserUid = user.uid; 
        currentDisplayName = user.email.split('@')[0]; 
        initUserAndLoadData(); 
    }
});

async function initUserAndLoadData() {
    if (!currentUserUid) return;

    try {
        const profileResponse = await fetch(backendUsersUrl + currentUserUid);
        
        if (profileResponse.status === 404) {
            openProfileModal(true);
        } else {
            userProfile = await profileResponse.json();
            
            if (userProfile.role === "admin") {
                const adminBtn = document.getElementById('admin-panel-btn');
                if(adminBtn) adminBtn.style.display = "inline-block";
            }
            
            currentDisplayName = userProfile.displayName || currentDisplayName;
            document.getElementById('user-name').textContent = currentDisplayName;

            const sessionsResponse = await fetch(backendBaseUrl + currentUserUid);
            const sessionsData = await sessionsResponse.json();
            window.cachedSessions = sessionsData; // Verileri globalde tut

            updateRecentSessions(sessionsData);
            updateCharts(); // YENİ: İki grafiği birden çizen fonksiyon
            checkStreak(sessionsData);
            
            loadLeaderboard(userProfile.targetExam || "Genel");
            loadAverageStat(userProfile.targetExam || "Genel");
            loadTodos();
            renderCalendarStrip(); 
            
            if(document.getElementById('tab-live').classList.contains('active')) {
                loadLiveUsers();
            }
        }
    } catch (error) {
        console.error("Veriler yüklenirken hata:", error);
    }
}

// Ortak Dinamik Zaman Formatlayıcı
const formatTime = (totalSecs) => {
    if (totalSecs >= 3600) {
        let h = Math.floor(totalSecs / 3600);
        let m = Math.floor((totalSecs % 3600) / 60);
        return m > 0 ? `${h} saat ${m} dk` : `${h} saat`;
    } else if (totalSecs >= 60) {
        let m = Math.floor(totalSecs / 60);
        let s = totalSecs % 60;
        return s > 0 ? `${m} dk ${s} sn` : `${m} dk`;
    } else {
        return `${totalSecs} sn`;
    }
};

// --- YENİ: İKİ GRAFİĞİ BİRDEN YÖNETEN FONKSİYON ---
function updateCharts() {
    renderDailySubjectChart();
    renderWeeklyTotalChart();
}

// 1. ÜST GRAFİK: Sadece Seçili Gündeki Dersler
function renderDailySubjectChart() {
    const ctx = document.getElementById('dailySubjectChart');
    if(!ctx) return;

    // Sadece seçili güne ait çalışmaları filtrele
    const dailySessions = window.cachedSessions.filter(s => {
        return new Date(s.date).toLocaleDateString('en-CA') === selectedDateStr;
    });

    const subjectTotals = {};
    dailySessions.forEach(s => { 
        subjectTotals[s.subject] = (subjectTotals[s.subject] || 0) + s.durationInSeconds; 
    });

    const labels = Object.keys(subjectTotals);
    const dataInSeconds = Object.values(subjectTotals); 

    if (dailyChartInstance) dailyChartInstance.destroy();

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(124, 58, 237, 0.8)'); // Mor ağırlıklı
    gradient.addColorStop(1, 'rgba(79, 70, 229, 0.4)'); 

    dailyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels: labels.length > 0 ? labels : ['Kayıt Yok'], 
            datasets: [{ 
                label: 'Ders Süresi', 
                data: dataInSeconds.length > 0 ? dataInSeconds : [0], 
                backgroundColor: gradient, 
                borderRadius: 8, 
                barPercentage: 0.5 
            }] 
        },
        options: {
            indexAxis: 'y', // Yatay bar daha şık durur ders isimleri için
            responsive: true,
            plugins: { 
                legend: { display: false }, 
                tooltip: { 
                    backgroundColor: 'rgba(30, 31, 46, 0.9)', titleColor: '#F8FAFC', bodyColor: '#F8FAFC', padding: 12, 
                    callbacks: { label: function(c) { return formatTime(c.raw); } } 
                } 
            },
            scales: { 
                x: { 
                    beginAtZero: true, grid: { borderDash: [5, 5], color: 'rgba(255, 255, 255, 0.1)' }, 
                    ticks: { color: 'rgba(255, 255, 255, 0.7)', callback: function(value) { return formatTime(value); } }, border: { display: false } 
                }, 
                y: { grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.7)', font: { weight: 'bold' } }, border: { display: false } } 
            }
        }
    });
}

// 2. ALT GRAFİK: Son 7 Günün Toplamları
function renderWeeklyTotalChart() {
    const ctx = document.getElementById('weeklyTotalChart');
    if(!ctx) return;

    const labels = [];
    const dailyTotals = {};
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
        let d = new Date();
        d.setDate(today.getDate() - i);
        let dateLabel = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        if (i === 0) dateLabel = "Bugün"; else if (i === 1) dateLabel = "Dün"; 
        labels.push(dateLabel);
        dailyTotals[dateLabel] = 0; 
    }

    window.cachedSessions.forEach(s => {
        let sDate = new Date(s.date);
        let sLabel = sDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        let todayLabel = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        let yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        let yesterdayLabel = yesterdayDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

        if (sLabel === todayLabel) sLabel = "Bugün";
        else if (sLabel === yesterdayLabel) sLabel = "Dün";

        if (dailyTotals[sLabel] !== undefined) {
            dailyTotals[sLabel] += s.durationInSeconds;
        }
    });

    const dataInSeconds = labels.map(label => dailyTotals[label]);

    if (weeklyChartInstance) weeklyChartInstance.destroy();

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(249, 115, 22, 0.8)'); // Turuncu ağırlıklı
    gradient.addColorStop(1, 'rgba(124, 58, 237, 0.4)'); 

    weeklyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels: labels, 
            datasets: [{ label: 'Günlük Toplam', data: dataInSeconds, backgroundColor: gradient, borderRadius: 8, barPercentage: 0.6 }] 
        },
        options: {
            responsive: true,
            plugins: { 
                legend: { display: false }, 
                tooltip: { 
                    backgroundColor: 'rgba(30, 31, 46, 0.9)', titleColor: '#F8FAFC', bodyColor: '#F8FAFC', padding: 12, 
                    callbacks: { label: function(c) { return formatTime(c.raw); } } 
                } 
            },
            scales: { 
                y: { 
                    beginAtZero: true, grid: { borderDash: [5, 5], color: 'rgba(255, 255, 255, 0.1)' }, 
                    ticks: { color: 'rgba(255, 255, 255, 0.7)', callback: function(value) { return formatTime(value); } }, border: { display: false } 
                }, 
                x: { grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.7)', font: { weight: 'bold' } }, border: { display: false } } 
            }
        }
    });
}
// -----------------------------------------------------------

window.showCustomDialog = function(title, message, icon, confirmText, confirmColor, onConfirm) {
    const dialog = document.getElementById('custom-dialog');
    if (!dialog) return; 
    
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-message').textContent = message;
    document.getElementById('dialog-icon').textContent = icon;
    
    const confirmBtn = document.getElementById('dialog-confirm-btn');
    confirmBtn.textContent = confirmText;
    confirmBtn.style.background = confirmColor;
    
    dialog.style.display = 'flex';
    
    confirmBtn.onclick = () => {
        dialog.style.display = 'none';
        if(onConfirm) onConfirm(); 
    };
    
    document.getElementById('dialog-cancel-btn').onclick = () => {
        dialog.style.display = 'none'; 
    };
};

const profileModal = document.getElementById('profile-modal');
const modalName = document.getElementById('modal-name');
const modalHours = document.getElementById('modal-hours');
const modalMinutes = document.getElementById('modal-minutes');
const modalExam = document.getElementById('modal-exam'); 

document.getElementById('profile-btn').addEventListener('click', () => openProfileModal(false));
document.getElementById('modal-cancel-btn').addEventListener('click', () => profileModal.style.display = 'none');

function openProfileModal(isNewUser) {
    profileModal.style.display = 'flex'; 
    if (isNewUser) {
        document.getElementById('modal-cancel-btn').style.display = 'none'; 
        modalName.value = currentDisplayName;
        modalHours.value = 0;
        modalMinutes.value = 10; 
        modalExam.value = "Genel";
    } else {
        document.getElementById('modal-cancel-btn').style.display = 'block';
        modalName.value = userProfile.displayName;
        modalHours.value = Math.floor(userProfile.dailyGoalSeconds / 3600);
        modalMinutes.value = Math.floor((userProfile.dailyGoalSeconds % 3600) / 60);
        modalExam.value = userProfile.targetExam || "Genel";
    }
}

document.getElementById('modal-save-btn').addEventListener('click', async () => {
    let h = parseInt(modalHours.value) || 0;
    let m = parseInt(modalMinutes.value) || 0;
    if (h === 0 && m === 0) m = 10; 

    userProfile = {
        userId: currentUserUid,
        displayName: modalName.value.trim() || currentDisplayName,
        dailyGoalSeconds: (h * 3600) + (m * 60),
        streakCount: userProfile ? userProfile.streakCount : 0,
        lastGoalMetDate: userProfile ? userProfile.lastGoalMetDate : "",
        targetExam: modalExam.value
    };

    await fetch(backendUsersUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userProfile)
    });
    location.reload(); 
});

const resetBtn = document.getElementById('reset-data-btn');
if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
        showCustomDialog("Tehlikeli Bölge", "Tüm çalışma geçmişin, grafiklerin, serin ve görevlerin SİLİNECEK. Bunu geri alamazsın. Emin misin?", "", "Her Şeyi Sıfırla", "#EF4444", async () => {
            try {
                await fetch(`https://onstudy-api.onrender.com/api/users/${currentUserUid}/reset`, { method: 'DELETE' });
                showCustomDialog("Sıfırlandı!", "Tüm verilerin temizlendi. Temiz bir sayfa açılıyor.", "", "Tamam", "var(--primary-purple)", () => location.reload());
            } catch (err) { console.error("Sıfırlama hatası:", err); }
        });
    });
}

async function loadLeaderboard(exam) {
    try {
        const response = await fetch(backendLeaderboardUrl + exam);
        const leaders = await response.json();
        const leaderboardList = document.getElementById('leaderboard-list');
        if(!leaderboardList) return;
        
        document.querySelector('#tab-leaderboard h2').textContent = `Global Sıralama - ${exam}`;
        leaderboardList.innerHTML = '';
        if(leaders.length === 0) {
            leaderboardList.innerHTML = `<div style="text-align:center; color: var(--text-muted);">Bu sınav kategorisinde henüz kimse çalışmadı. İlk sen ol!</div>`;
            return;
        }

        leaders.forEach((leader, index) => {
            const li = document.createElement('li');
            let h = Math.floor(leader.totalSeconds / 3600);
            let m = Math.floor((leader.totalSeconds % 3600) / 60);
            let timeStr = h > 0 ? `${h}h ${m}m` : `${m}m ${leader.totalSeconds%60}s`;
            let rankMedal = index === 0 ? "1." : index === 1 ? "2." : index === 2 ? "3." : `${index + 1}.`;
            const isMe = leader.displayName === currentDisplayName;

            li.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: ${isMe ? 'rgba(124, 58, 237, 0.1)' : 'rgba(255, 255, 255, 0.02)'}; border: 1px solid ${isMe ? 'rgba(124, 58, 237, 0.3)' : 'rgba(255,255,255,0.05)'}; border-radius: 10px; margin-bottom: 10px;">
                    <span style="font-weight: 600; color: ${isMe ? 'var(--primary-purple)' : 'var(--text-light)'};">${rankMedal} ${leader.displayName}</span>
                    <span style="background: rgba(255,255,255,0.05); padding: 5px 10px; border-radius: 20px; font-size: 0.9em;">${timeStr}</span>
                </div>`;
            leaderboardList.appendChild(li);
        });
    } catch(err) { console.error(err); }
}

async function loadTodos() {
    const response = await fetch(`${backendTodoUrl}${currentUserUid}/${selectedDateStr}`);
    const todos = await response.json();
    const list = document.getElementById('todo-list');
    list.innerHTML = '';

    if (todos.length === 0) {
        list.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 10px;">Bu gün için planlanmış bir görev yok. Hadi ekle!</div>`;
        return;
    }

    todos.forEach(todo => {
        const li = document.createElement('li');
        li.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 10px; transition: 0.2s;`;
        
        li.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px; cursor: pointer;" onclick="toggleTodo('${todo.id}', ${!todo.isCompleted})">
                <div style="width: 20px; height: 20px; border-radius: 5px; border: 2px solid var(--primary-purple); background: ${todo.isCompleted ? 'var(--primary-purple)' : 'transparent'}; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px;">${todo.isCompleted ? '✓' : ''}</div>
                <span style="color: ${todo.isCompleted ? 'var(--text-muted)' : 'var(--text-light)'}; text-decoration: ${todo.isCompleted ? 'line-through' : 'none'}; font-size: 1rem;">${todo.title}</span>
            </div>
            <button onclick="deleteTodo('${todo.id}')" style="background: transparent; padding: 5px 10px; color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.8em; border-radius: 5px; cursor: pointer;">Sil</button>
        `;
        list.appendChild(li);
    });
}

document.getElementById('add-todo-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-todo-input');
    if(!input.value.trim()) return;
    
    await fetch('https://onstudy-api.onrender.com/api/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserUid, title: input.value, isCompleted: false, date: selectedDateStr })
    });
    input.value = '';
    loadTodos();
});

async function toggleTodo(id, newState) {
    await fetch(`https://onstudy-api.onrender.com/api/todos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isCompleted: newState }) });
    loadTodos();
}

async function deleteTodo(id) {
    await fetch(`https://onstudy-api.onrender.com/api/todos/${id}`, { method: 'DELETE' });
    loadTodos();
}

function renderCalendarStrip() {
    const strip = document.getElementById('calendar-strip');
    if(!strip) return;
    strip.innerHTML = '';
    
    const today = new Date();
    const currentDay = today.getDay(); 
    const startOfWeek = new Date(today);
    const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1); 
    startOfWeek.setDate(diff);

    const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        
        const iterDateStr = date.toLocaleDateString('en-CA');
        const isSelected = (iterDateStr === selectedDateStr);
        
        const dayDiv = document.createElement('div');
        dayDiv.className = `cal-day ${isSelected ? 'active' : ''}`;
        dayDiv.style.cursor = 'pointer'; 
        
        dayDiv.onclick = () => {
            selectedDateStr = iterDateStr; 
            renderCalendarStrip();         
            loadTodos();                   
            if(window.cachedSessions) updateCharts(); // YENİ: Takvime basınca üstteki grafiği de güncelle!
        };
        
        dayDiv.innerHTML = `
            <span class="cal-day-name">${dayNames[i]}</span>
            <span class="cal-day-num">${date.getDate()}</span>
        `;
        strip.appendChild(dayDiv);
    }
}

async function checkStreak(sessions) {
    if (!userProfile) return;
    const todayStr = new Date().toLocaleDateString();
    let todayTotalSeconds = 0;
    sessions.forEach(s => { if (new Date(s.date).toLocaleDateString() === todayStr) todayTotalSeconds += s.durationInSeconds; });

    if (todayTotalSeconds >= userProfile.dailyGoalSeconds && userProfile.lastGoalMetDate !== todayStr) {
        userProfile.streakCount += 1;
        userProfile.lastGoalMetDate = todayStr;
        await fetch(backendUsersUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(userProfile) });
    }

    const streakDisplay = document.getElementById('streak-display');
    streakDisplay.innerHTML = userProfile.streakCount > 0 ? `Seri: ${userProfile.streakCount}` : `Seri: 0`; 
}

window.deleteSession = async function(sessionId) {
    if (!sessionId || sessionId === "undefined") return;
    showCustomDialog("Kaydı Sil", "Bu çalışma kaydını silmek istediğine emin misin? Grafikler güncellenecektir.", "", "Evet, Sil", "#EF4444", async () => {
        try { await fetch(backendBaseUrl + sessionId, { method: 'DELETE' }); location.reload(); } catch (error) { console.error("Silme hatası:", error); }
    });
};

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
        const sessionId = session.id || session.Id; 

        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; font-size: 1.1em; color: var(--text-light);">${session.subject}</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="background-color: rgba(79, 70, 229, 0.2); color: #c7d2fe; padding: 4px 10px; border-radius: 20px; font-weight: bold; font-size: 0.9em; border: 1px solid rgba(79, 70, 229, 0.3);">Süre: ${timeString}</span>
                    <button onclick="deleteSession('${sessionId}')" style="background: transparent; border: none; color: #EF4444; cursor: pointer; font-size: 0.9em; font-weight: bold; padding: 0 5px;" title="Bu kaydı sil">Sil</button>
                </div>
            </div>
            <div style="margin-top: 5px; font-size: 0.8em; color: var(--text-muted);">Tarih: ${dateString}</div>
        `;
        li.style.background = "rgba(255, 255, 255, 0.02)";
        li.style.margin = "10px 0";
        li.style.padding = "15px";
        li.style.borderRadius = "10px";
        li.style.border = "1px solid rgba(255, 255, 255, 0.05)";
        li.style.borderLeft = "5px solid var(--primary-purple)"; 
        sessionList.appendChild(li);
    });
}

window.joinLiveRoom = async function(subjectName) {
    if(!currentUserUid || !userProfile) return;
    try {
        await fetch("https://onstudy-api.onrender.com/api/live/join", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ userId: currentUserUid, displayName: userProfile.displayName, exam: userProfile.targetExam || "Genel", subject: subjectName })
        });
    } catch(err) { console.error(err); }
};

window.leaveLiveRoom = async function() {
    if(!currentUserUid) return;
    try {
        await fetch("https://onstudy-api.onrender.com/api/live/leave", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ userId: currentUserUid, displayName: "", exam: "", subject: "" })
        });
    } catch(err) { console.error(err); }
};

window.loadLiveUsers = async function() {
    if (!userProfile) return;
    const exam = userProfile.targetExam || "Genel";
    try {
        const response = await fetch(`https://onstudy-api.onrender.com/api/live/${exam}`);
        const liveUsers = await response.json();
        
        const grid = document.getElementById('live-users-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        if(liveUsers.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; color: var(--text-muted); padding: 20px;">Şu an bu kütüphanede kimse yok. İlk giren sen ol!</div>`;
            return;
        }

        liveUsers.forEach(user => {
            const isMe = user.userId === currentUserUid;
            const div = document.createElement('div');
            div.style.cssText = `background: rgba(255,255,255,0.03); border: 1px solid ${isMe ? 'var(--primary-purple)' : 'rgba(255,255,255,0.05)'}; padding: 15px; border-radius: 12px; display: flex; flex-direction: column; gap: 10px;`;
            
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; color: ${isMe ? 'var(--primary-purple)' : 'var(--text-light)'};">${user.displayName} ${isMe ? '(Sen)' : ''}</span>
                    <div style="width: 10px; height: 10px; background: #10B981; border-radius: 50%; box-shadow: 0 0 8px #10B981;"></div> 
                </div>
                <div style="font-size: 0.85em; color: var(--text-muted);">Ders: ${user.subject}</div>
                ${!isMe ? `<button onclick="sendPoke('${user.userId}', '${user.displayName}')" style="margin-top: 5px; background: transparent; border: 1px solid var(--accent-orange); color: var(--accent-orange); border-radius: 6px; padding: 5px; cursor: pointer; transition: 0.2s; font-weight:600; font-size:0.85rem;">Motivasyon Gönder</button>` : ''}
            `;
            grid.appendChild(div);
        });
    } catch (err) { console.error("Kütüphane hatası:", err); }
};

window.sendPoke = async function(targetUserId, targetName) {
    try {
        await fetch("https://onstudy-api.onrender.com/api/pokes", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                toUserId: targetUserId,
                fromUserName: currentDisplayName
            })
        });
        if (window.showCustomDialog) { 
            showCustomDialog("Başarılı", `${targetName} adlı kullanıcıya odaklanma motivasyonu gönderildi!`, "", "Tamam", "var(--accent-orange)", null); 
        } 
    } catch(err) { console.error(err); }
}

window.checkForPokes = async function() {
    if(!currentUserUid) return;
    try {
        const response = await fetch(`https://onstudy-api.onrender.com/api/pokes/${currentUserUid}`);
        const pokes = await response.json();
        
        if(pokes.length > 0) {
            const poke = pokes[0]; 
            if (window.showCustomDialog) {
                showCustomDialog("Motivasyon Geldi!", `${poke.fromUserName} sana odaklanman için motivasyon gönderdi!`, "", "Teşekkürler", "var(--accent-orange)", null);
            }
        }
    } catch(err) {}
};

setInterval(window.checkForPokes, 10000);

window.activeRoomId = null;
window.activeRoomName = "";
let privateRoomInterval = null;

window.loadLobbyRooms = async function() {
    try {
        const response = await fetch("https://onstudy-api.onrender.com/api/rooms");
        const rooms = await response.json();
        const grid = document.getElementById('lobby-grid');
        grid.innerHTML = '';
        
        if (rooms.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color: var(--text-muted); padding: 30px;">Şu an aktif bir oda yok. İlk odayı sen kur!</div>`;
            return;
        }

        rooms.forEach(r => {
            const isAdmin = userProfile && userProfile.role === "admin";
            
            grid.innerHTML += `
                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 20px; border-radius: 12px; transition: 0.2s; cursor: pointer; position: relative;" 
                     onmouseover="this.style.borderColor='var(--primary-purple)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.05)'"
                     onclick="attemptJoinRoom('${r.roomId}', '${r.name}', ${r.isLocked})">
                    
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                        <h4 style="margin: 0; color: var(--text-light); font-size: 1.1rem;">${r.name}</h4>
                        ${r.isLocked ? `<span style="font-size: 0.75rem; font-weight:600; background: rgba(239,68,68,0.1); color: #EF4444; padding: 4px 8px; border-radius: 6px;">Kilitli</span>` : `<span style="font-size: 0.75rem; font-weight:600; background: rgba(16,185,129,0.1); color: #10B981; padding: 4px 8px; border-radius: 6px;">Açık</span>`}
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px;">Kurucu: ${r.creator}</div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.85rem; color: var(--accent-orange); background: rgba(249,115,22,0.1); padding: 4px 8px; border-radius: 6px; font-weight: bold;">Kişi: ${r.userCount}</span>
                        <span style="font-size: 0.85rem; color: var(--primary-purple); font-weight: bold;">Katıl ➜</span>
                    </div>
                    
                    ${isAdmin ? `
                    <button onclick="event.stopPropagation(); destroyRoomByAdmin('${r.roomId}', '${r.name}')" 
                            style="position: absolute; bottom: -15px; right: 10px; background: #EF4444; color: white; border: none; padding: 5px 10px; border-radius: 5px; font-size: 0.8rem; cursor: pointer; font-weight: bold; box-shadow: 0 2px 5px rgba(239,68,68,0.5);">
                        🔥 İmha Et
                    </button>
                    ` : ''}
                </div>
            `;
        });
    } catch(err) { console.error("Lobi yüklenemedi:", err); }
};

window.createNewRoom = async function() {
    const name = document.getElementById('new-room-name').value.trim();
    const pass = document.getElementById('new-room-password').value.trim();
    
    if(!name) { alert("Oda adı boş olamaz!"); return; }

    try {
        const res = await fetch("https://onstudy-api.onrender.com/api/rooms", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ name: name, password: pass, creator: currentDisplayName })
        });
        const data = await res.json();
        
        document.getElementById('new-room-name').value = '';
        document.getElementById('new-room-password').value = '';
        document.getElementById('create-room-form').style.display = 'none';
        document.getElementById('lobby-grid').style.display = 'grid';
        
        joinRoomDirectly(data.roomId, name);
    } catch(err) { console.error(err); }
};

window.attemptJoinRoom = async function(roomId, roomName, isLocked) {
    if (isLocked) {
        const pass = prompt(`"${roomName}" odası şifreli. Lütfen şifreyi girin:`);
        if (pass === null) return; 
        
        try {
            const res = await fetch("https://onstudy-api.onrender.com/api/rooms/verify", {
                method: "POST", headers: {"Content-Type":"application/json"},
                body: JSON.stringify({ roomId: roomId, password: pass })
            });
            if(res.ok) {
                joinRoomDirectly(roomId, roomName);
            } else {
                alert("Hatalı şifre!");
            }
        } catch(err) { alert("Hatalı şifre!"); }
    } else {
        joinRoomDirectly(roomId, roomName);
    }
};

window.joinRoomDirectly = async function(roomId, roomName) {
    window.activeRoomId = roomId;
    window.activeRoomName = roomName;
    
    try {
        await fetch("https://onstudy-api.onrender.com/api/private/join", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ userId: currentUserUid, displayName: currentDisplayName, roomId: roomId })
        });
        
        document.getElementById('lobby-screen').style.display = 'none';
        document.getElementById('private-room-screen').style.display = 'block';
        document.getElementById('current-room-name').textContent = roomName;
        
        refreshPrivateRoom();
        privateRoomInterval = setInterval(refreshPrivateRoom, 3000);

    } catch(err) { console.error("Odaya girilemedi:", err); }
};

window.leavePrivateRoom = async function() {
    if(!currentUserUid) return;
    clearInterval(privateRoomInterval);
    try {
        await fetch("https://onstudy-api.onrender.com/api/private/leave", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ userId: currentUserUid, roomId: activeRoomId }) 
        });
        window.activeRoomId = null;
        document.getElementById('lobby-screen').style.display = 'block';
        document.getElementById('private-room-screen').style.display = 'none';
        loadLobbyRooms(); 
    } catch(err) {}
};

window.refreshPrivateRoom = async function() {
    if(!activeRoomId) return;
    try {
        const uRes = await fetch(`https://onstudy-api.onrender.com/api/private/${activeRoomId}/users`);
        const users = await uRes.json();
        const uList = document.getElementById('private-users-list');
        uList.innerHTML = '';
        users.forEach(u => {
            const isMe = u.userId === currentUserUid;
            uList.innerHTML += `
                <div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.03); padding:10px; border-radius:8px; border:1px solid ${isMe ? 'var(--primary-purple)' : 'rgba(255,255,255,0.05)'};">
                    <div style="width: 8px; height: 8px; background: #10B981; border-radius: 50%; box-shadow: 0 0 5px #10B981;"></div>
                    <span style="color:var(--text-light); font-size:0.9rem;">${u.displayName} ${isMe ? '(Sen)' : ''}</span>
                </div>`;
        });
    } catch(err) {}

    try {
        const cRes = await fetch(`https://onstudy-api.onrender.com/api/private/${activeRoomId}/chat`);
        const msgs = await cRes.json();
        const cBox = document.getElementById('chat-box');
        const isScrolledToBottom = cBox.scrollHeight - cBox.clientHeight <= cBox.scrollTop + 10;
        
        cBox.innerHTML = '';
        msgs.forEach(m => {
            cBox.innerHTML += `<div class="chat-msg"><span>${m.senderName}:</span> ${m.text}</div>`;
        });
        if (isScrolledToBottom) cBox.scrollTop = cBox.scrollHeight;
    } catch(err) {}
};

window.sendChatMessage = async function() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text || !activeRoomId) return;
    
    input.value = ''; 
    
    try {
        await fetch("https://onstudy-api.onrender.com/api/private/chat", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ roomId: activeRoomId, senderName: currentDisplayName, text: text })
        });
        refreshPrivateRoom(); 
    } catch(err) { console.error("Mesaj gönderilemedi:", err); }
};

window.addEventListener('beforeunload', () => { if(activeRoomId) leavePrivateRoom(); });

async function loadAverageStat(exam) {
    if (!exam || exam === "Genel") {
        const banner = document.getElementById('average-stat-banner');
        if (banner) banner.style.display = 'none';
        return;
    }
    
    try {
        const res = await fetch(backendLeaderboardUrl + exam);
        const leaders = await res.json();
        
        if (leaders.length > 0) {
            let totalSeconds = 0;
            leaders.forEach(l => totalSeconds += l.totalSeconds);
            
            let avgSeconds = Math.floor(totalSeconds / leaders.length);
            let h = Math.floor(avgSeconds / 3600);
            let m = Math.floor((avgSeconds % 3600) / 60);
            let timeStr = h > 0 ? `${h} saat ${m} dk` : `${m} dk`;
            
            const banner = document.getElementById('average-stat-banner');
            if (banner) {
                banner.innerHTML = `💡 <b>İlham Verici Bir Bilgi:</b> <b>${exam}</b> hedefine koşan topluluğumuz, kişi başı ortalama <b>${timeStr}</b> odaklandı. Sen de bu ekibin harika bir parçasısın!`;
                banner.style.display = 'block';
            }
        }
    } catch(err) { console.error("Ortalama istatistik çekilemedi", err); }
}

setInterval(async () => {
    if (window.activeRoomId && currentUserUid) {
        try {
            await fetch(`https://onstudy-api.onrender.com/api/private/heartbeat`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ userId: currentUserUid, roomId: window.activeRoomId })
            });
        } catch(err) { console.error("Heartbeat gönderilemedi:", err); }
    }
}, 120000); 

window.addEventListener('load', () => {
    try {
        fetch("https://onstudy-api.onrender.com/api/private/cleanup", { method: "POST" });
    } catch(err) { console.error("Cleanup tetikleme hatası:", err); }
});

window.destroyRoomByAdmin = async function(roomId, roomName) {
    if(!confirm(`DİKKAT! "${roomName}" adlı odayı ve içindeki mesajları kalıcı olarak SİLMEK istediğine emin misin?`)) return;
    
    try {
        const response = await fetch(`https://onstudy-api.onrender.com/api/admin/rooms/${roomId}/${currentUserUid}`, { 
            method: 'DELETE' 
        });
        
        if(response.ok) {
            alert("🔥 Oda ve içindeki tüm kalıntılar başarıyla imha edildi!");
            loadLobbyRooms(); 
        } else {
            alert("Yetkisiz işlem! Bu odayı silmek için Admin olmalısın.");
        }
    } catch(err) { console.error("Silme hatası:", err); }
};

window.loadDashboardData = initUserAndLoadData;

const topAdminBtn = document.getElementById('admin-panel-btn');
if (topAdminBtn) {
    topAdminBtn.addEventListener('click', () => {
        if(window.showCustomDialog) {
            showCustomDialog("Admin Yetkisi Aktif", "Sistem yöneticisi olarak tanındınız. Lobi sekmesine giderek asılı kalan veya sorunlu odaları 'İmha Et' butonu ile kalıcı olarak silebilirsiniz.", "🛡️", "Anladım", "var(--primary-purple)", null);
        } else {
            alert("Admin Yetkisi Aktif!\nLobi sekmesine giderek odaları silebilirsiniz.");
        }
    });
}