const backendBaseUrl = "http://localhost:5195/api/sessions/";
const backendUsersUrl = "http://localhost:5195/api/users/";
const backendLeaderboardUrl = "http://localhost:5195/api/leaderboard/";
const backendTodoUrl = "http://localhost:5195/api/todos/";
let studyChartInstance = null; 
let currentUserUid = null;
let currentDisplayName = null;
let userProfile = null;

// --- YENİ: SEÇİLİ TARİH HAFIZASI ---
// Varsayılan olarak bugünü "YYYY-MM-DD" formatında alıyoruz.
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
            currentDisplayName = userProfile.displayName || currentDisplayName;
            document.getElementById('user-name').textContent = currentDisplayName;

            const sessionsResponse = await fetch(backendBaseUrl + currentUserUid);
            const sessionsData = await sessionsResponse.json();

            updateRecentSessions(sessionsData);
            updateChart(sessionsData);
            checkStreak(sessionsData);
            
            loadLeaderboard(userProfile.targetExam || "Genel");
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
        showCustomDialog("Tehlikeli Bölge", "Tüm çalışma geçmişin, grafiklerin, ateşin ve görevlerin SİLİNECEK. Bunu geri alamazsın. Emin misin?", "⚠️", "Her Şeyi Sıfırla", "#EF4444", async () => {
            try {
                await fetch(`http://localhost:5195/api/users/${currentUserUid}/reset`, { method: 'DELETE' });
                showCustomDialog("Sıfırlandı!", "Tüm verilerin temizlendi. Temiz bir sayfa açılıyor.", "✅", "Tamam", "var(--primary-purple)", () => location.reload());
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
        
        document.querySelector('#tab-leaderboard h2').textContent = `🏆 Global Sıralama - ${exam}`;
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
            let rankMedal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
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

// --- TO-DO LIST YÖNETİMİ (TARİHE GÖRE ÇEKİYOR) ---
async function loadTodos() {
    // Sadece seçili günün görevlerini getir
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
    
    await fetch('http://localhost:5195/api/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // YENİ: Görevi, yukarıdan seçili olan tarihe ekliyor
        body: JSON.stringify({ userId: currentUserUid, title: input.value, isCompleted: false, date: selectedDateStr })
    });
    input.value = '';
    loadTodos();
});

async function toggleTodo(id, newState) {
    await fetch(`http://localhost:5195/api/todos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isCompleted: newState }) });
    loadTodos();
}

async function deleteTodo(id) {
    await fetch(`http://localhost:5195/api/todos/${id}`, { method: 'DELETE' });
    loadTodos();
}

// --- APPLE TARZI TAKVİM ŞERİDİ (TIKLANABİLİR YENİ VERSİYON) ---
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
        
        // Bu günün tarihini YYYY-MM-DD olarak al
        const iterDateStr = date.toLocaleDateString('en-CA');
        
        // Eğer bu gün bizim seçtiğimiz gün ise aktif yap (mor renk)
        const isSelected = (iterDateStr === selectedDateStr);
        
        const dayDiv = document.createElement('div');
        dayDiv.className = `cal-day ${isSelected ? 'active' : ''}`;
        dayDiv.style.cursor = 'pointer'; // Tıklanabilir el ikonu
        
        // Tıklanınca o güne geç ve görevleri yenile
        dayDiv.onclick = () => {
            selectedDateStr = iterDateStr; // Seçili tarihi değiştir
            renderCalendarStrip();         // Takvimi yeniden çiz (mor kutuyu kaydır)
            loadTodos();                   // O günün görevlerini getir!
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
    streakDisplay.innerHTML = userProfile.streakCount > 0 ? `🔥 ${userProfile.streakCount}` : `🔥 0`; 
}

window.deleteSession = async function(sessionId) {
    if (!sessionId || sessionId === "undefined") return;
    showCustomDialog("Kaydı Sil", "Bu çalışma kaydını silmek istediğine emin misin? Grafikler güncellenecektir.", "🗑️", "Evet, Sil", "#EF4444", async () => {
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
                    <span style="background-color: rgba(79, 70, 229, 0.2); color: #c7d2fe; padding: 4px 10px; border-radius: 20px; font-weight: bold; font-size: 0.9em; border: 1px solid rgba(79, 70, 229, 0.3);">⏱️ ${timeString}</span>
                    <button onclick="deleteSession('${sessionId}')" style="background: transparent; border: none; color: #EF4444; cursor: pointer; font-size: 1.1em; padding: 0 5px;" title="Bu kaydı sil">🗑️</button>
                </div>
            </div>
            <div style="margin-top: 5px; font-size: 0.8em; color: var(--text-muted);">📅 ${dateString}</div>
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

function updateChart(sessions) {
    const subjectTotals = {};
    sessions.forEach(s => { subjectTotals[s.subject] = (subjectTotals[s.subject] || 0) + s.durationInSeconds; });

    const labels = Object.keys(subjectTotals);
    const dataInSeconds = Object.values(subjectTotals); 
    const ctx = document.getElementById('studyChart').getContext('2d');
    if (studyChartInstance) studyChartInstance.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(249, 115, 22, 0.8)'); 
    gradient.addColorStop(1, 'rgba(124, 58, 237, 0.4)'); 

    studyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Çalışma Süresi (Saniye)', data: dataInSeconds, backgroundColor: gradient, borderRadius: 8, barPercentage: 0.6 }] },
        options: {
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(30, 31, 46, 0.9)', titleColor: '#F8FAFC', bodyColor: '#F8FAFC', padding: 12, callbacks: { label: function(c) { return c.raw + ' Saniye'; } } } },
            scales: { y: { beginAtZero: true, grid: { borderDash: [5, 5], color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: 'rgba(255, 255, 255, 0.7)' }, border: { display: false } }, x: { grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.7)' }, border: { display: false } } }
        }
    });
}

// --- SANAL KÜTÜPHANEYE GİRİŞ / ÇIKIŞ ---
window.joinLiveRoom = async function(subjectName) {
    if(!currentUserUid || !userProfile) return;
    try {
        await fetch("http://localhost:5195/api/live/join", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ userId: currentUserUid, displayName: userProfile.displayName, exam: userProfile.targetExam || "Genel", subject: subjectName })
        });
    } catch(err) { console.error(err); }
};

window.leaveLiveRoom = async function() {
    if(!currentUserUid) return;
    try {
        await fetch("http://localhost:5195/api/live/leave", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ userId: currentUserUid, displayName: "", exam: "", subject: "" })
        });
    } catch(err) { console.error(err); }
};

// --- SANAL KÜTÜPHANEYİ GETİR ---
window.loadLiveUsers = async function() {
    if (!userProfile) return;
    const exam = userProfile.targetExam || "Genel";
    try {
        const response = await fetch(`http://localhost:5195/api/live/${exam}`);
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
                <div style="font-size: 0.85em; color: var(--text-muted);">📚 ${user.subject}</div>
                ${!isMe ? `<button onclick="sendPoke('${user.userId}', '${user.displayName}')" style="margin-top: 5px; background: transparent; border: 1px solid var(--accent-orange); color: var(--accent-orange); border-radius: 6px; padding: 5px; cursor: pointer; transition: 0.2s;">🔥 Ateş Gönder</button>` : ''}
            `;
            grid.appendChild(div);
        });
    } catch (err) { console.error("Kütüphane hatası:", err); }
};

// --- ATEŞİ GERÇEKTEN VERİTABANINA GÖNDERME ---
window.sendPoke = async function(targetUserId, targetName) {
    try {
        await fetch("http://localhost:5195/api/pokes", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                toUserId: targetUserId,
                fromUserName: currentDisplayName
            })
        });
        if (window.showCustomDialog) { 
            showCustomDialog("Harika!", `${targetName} adlı kullanıcıya odaklanma ateşi gönderildi! 🔥`, "✨", "Tamam", "var(--accent-orange)", null); 
        } 
    } catch(err) { console.error(err); }
}

// --- BANA ATEŞ GELDİ Mİ DİYE DİNLEME (POSTACI) ---
window.checkForPokes = async function() {
    if(!currentUserUid) return;
    try {
        const response = await fetch(`http://localhost:5195/api/pokes/${currentUserUid}`);
        const pokes = await response.json();
        
        if(pokes.length > 0) {
            const poke = pokes[0]; 
            if (window.showCustomDialog) {
                showCustomDialog("Motivasyon Geldi!", `${poke.fromUserName} sana odaklanman için ateş gönderdi! 🔥`, "🔥", "Teşekkürler", "var(--accent-orange)", null);
            }
        }
    } catch(err) {}
};

// HER 10 SANİYEDE BİR KONTROL ET
setInterval(window.checkForPokes, 10000);

window.loadDashboardData = initUserAndLoadData;