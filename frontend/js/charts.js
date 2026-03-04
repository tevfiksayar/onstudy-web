const backendUrl = "http://localhost:5195/api/sessions";
let studyChartInstance = null; // Eski grafiği silmek için tuttuğumuz değişken

// 1. Backend'den Verileri Çekme Fonksiyonu
async function loadDashboardData() {
    try {
        const response = await fetch(backendUrl);
        const data = await response.json();

        updateRecentSessions(data);
        updateChart(data);
    } catch (error) {
        console.error("Veriler çekilirken hata oluştu:", error);
    }
}

// 2. "Recent Sessions" (Son Çalışmalar) Listesini Güncelleme
function updateRecentSessions(sessions) {
    const sessionList = document.getElementById('session-list');
    sessionList.innerHTML = ''; // Önce listeyi temizle

    if (sessions.length === 0) {
        sessionList.innerHTML = '<li>No sessions yet. Start studying!</li>';
        return;
    }

    sessions.forEach(session => {
        const li = document.createElement('li');
        
        // Saniyeyi Dakika ve Saniye cinsine çevirme (Örn: 65s -> 1m 5s)
        const mins = Math.floor(session.durationInSeconds / 60);
        const secs = session.durationInSeconds % 60;
        const timeString = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

        // Tarihi okunaklı formata çevirme
        const dateObj = new Date(session.date);
        const dateString = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        // HTML'e ekleme
        li.innerHTML = `<strong>${session.subject}</strong> - <span>${timeString}</span> <br><small style="color: gray;">${dateString}</small>`;
        li.style.marginBottom = "10px";
        li.style.borderBottom = "1px solid #eee";
        li.style.paddingBottom = "5px";
        
        sessionList.appendChild(li);
    });
}

// 3. Chart.js Grafiğini Güncelleme
function updateChart(sessions) {
    // Verileri derslere göre grupla (Örn: Math: 120 sn, Science: 300 sn)
    const subjectTotals = {};
    sessions.forEach(session => {
        if (!subjectTotals[session.subject]) {
            subjectTotals[session.subject] = 0;
        }
        subjectTotals[session.subject] += session.durationInSeconds;
    });

    // Grafikte göstermek için saniyeleri dakikaya çevir
    const labels = Object.keys(subjectTotals);
    const dataInMinutes = Object.values(subjectTotals).map(sec => (sec / 60).toFixed(2));

    const ctx = document.getElementById('studyChart').getContext('2d');

    // Eğer önceden çizilmiş bir grafik varsa onu yok et (üst üste binme bug'ını engeller)
    if (studyChartInstance) {
        studyChartInstance.destroy();
    }

    // Yeni grafiği çiz
    studyChartInstance = new Chart(ctx, {
        type: 'bar', // Çubuk grafik
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Study Time (Minutes)',
                data: dataInMinutes,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Minutes'
                    }
                }
            }
        }
    });
}

// Sayfa yüklendiğinde verileri getir
document.addEventListener('DOMContentLoaded', loadDashboardData);

// Diğer dosyaların (örn: timer.js) grafiği güncelleyebilmesi için fonksiyonu dışa aktarıyoruz
window.loadDashboardData = loadDashboardData;