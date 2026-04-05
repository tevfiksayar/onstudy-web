// 1. FIREBASE AYARLARI (import satırları yok!)
const firebaseConfig = {
    apiKey: "AIzaSyCWhL0d5NWex9XEyA441M9kF9UX8SlM0V8",
    authDomain: "onstudy-1a735.firebaseapp.com",
    projectId: "onstudy-1a735",
    storageBucket: "onstudy-1a735.firebasestorage.app",
    messagingSenderId: "513055184070",
    appId: "1:513055184070:web:038ecc9e2d6ba67b56f3c7",
    measurementId: "G-CG7KEP012P"
};

// Firebase başlatma kontrolü
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

// 2. GÜVENLİK (Giriş yapmayanları dışarı at, giriş yapanın adını yaz)
auth.onAuthStateChanged((user) => {
    if (!user) {
        // Oturum yoksa veya çıkış yapıldıysa direkt giriş sayfasına yolla
        window.location.href = "index.html"; 
    } else {
        // Giriş yapılmışsa e-postanın @ işaretinden önceki kısmını ekrana yaz
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = user.email.split('@')[0];
        }
    }
});

// 3. ÇIKIŞ YAP (SIGN OUT) BUTONU
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            console.log("Çıkış yapıldı.");
            // onAuthStateChanged tetikleneceği için yönlendirmeyi o halledecek
        }).catch((error) => {
            console.error("Çıkış hatası:", error);
        });
    });
}
// ==========================================
// 4. PROFİL AYARLARI VE MODAL KONTROLÜ
// ==========================================
const profileBtn = document.getElementById('profile-btn');
const profileModal = document.getElementById('profile-modal');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalSaveBtn = document.getElementById('modal-save-btn');

// Modalı aç ve kayıtlı verileri içine doldur
if (profileBtn) {
    profileBtn.addEventListener('click', () => {
        document.getElementById('modal-name').value = localStorage.getItem('onStudy_name') || '';
        document.getElementById('modal-exam').value = localStorage.getItem('onStudy_exam') || 'Genel';
        document.getElementById('modal-hours').value = localStorage.getItem('onStudy_hours') || '';
        document.getElementById('modal-minutes').value = localStorage.getItem('onStudy_minutes') || '';
        profileModal.style.display = 'flex';
    });
}

// Modalı kapat
if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', () => {
        profileModal.style.display = 'none';
    });
}

// Değişiklikleri kaydet
if (modalSaveBtn) {
    modalSaveBtn.addEventListener('click', () => {
        const name = document.getElementById('modal-name').value;
        const exam = document.getElementById('modal-exam').value;
        const hours = document.getElementById('modal-hours').value;
        const mins = document.getElementById('modal-minutes').value;

        // Verileri tarayıcıya kaydet
        localStorage.setItem('onStudy_name', name);
        localStorage.setItem('onStudy_exam', exam);
        localStorage.setItem('onStudy_hours', hours);
        localStorage.setItem('onStudy_minutes', mins);

        // Sağ üstteki ismi güncelle
        const userNameElement = document.getElementById('user-name');
        if (userNameElement && name) {
            userNameElement.textContent = name;
        }

        profileModal.style.display = 'none';
    });
}

// Sayfa ilk yüklendiğinde kullanıcının adını ve sınavını ayarla
document.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('onStudy_name');
    const savedExam = localStorage.getItem('onStudy_exam');
    
    if (savedName) {
        document.getElementById('user-name').textContent = savedName;
    }
});


// ==========================================
// 5. GÖREVLER (TO-DO) YÖNETİMİ
// ==========================================
const addTodoBtn = document.getElementById('add-todo-btn');
const newTodoInput = document.getElementById('new-todo-input');
const todoList = document.getElementById('todo-list');

// Seçili günün görevlerini ekrana basan fonksiyon
window.loadTodos = function() {
    if (!todoList) return;
    todoList.innerHTML = '';
    
    // Eğer takvimden gün seçilmişse onu al, yoksa bugünün tarihini al
    const dateKey = window.selectedDateStr || new Date().toLocaleDateString('en-CA');
    const todos = JSON.parse(localStorage.getItem('onStudy_todos_' + dateKey) || '[]');

    if (todos.length === 0) {
        todoList.innerHTML = '<li style="text-align:center; color:var(--text-muted); padding:20px; font-size:0.9rem; background:rgba(255,255,255,0.02); border-radius:8px;">Bu güne ait bir görev bulunmuyor.</li>';
        return;
    }

    todos.forEach((todo, index) => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '15px';
        li.style.marginBottom = '10px';
        li.style.padding = '15px';
        li.style.background = 'rgba(255,255,255,0.02)';
        li.style.borderRadius = '10px';
        li.style.border = '1px solid rgba(255,255,255,0.05)';
        li.style.transition = '0.2s';

        li.innerHTML = `
            <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="toggleTodo(${index})" style="width:20px; height:20px; cursor:pointer; accent-color: var(--primary-purple);">
            <span style="flex:1; font-size:0.95rem; color: ${todo.completed ? 'var(--text-muted)' : 'var(--text-light)'}; text-decoration: ${todo.completed ? 'line-through' : 'none'};">${todo.text}</span>
            <button onclick="deleteTodo(${index})" style="background:transparent; border:1px solid #EF4444; color:#EF4444; cursor:pointer; padding:5px 10px; border-radius:6px; font-size:0.8rem;">Sil</button>
        `;
        todoList.appendChild(li);
    });
}

// Görev ekleme butonu tetikleyicisi
if (addTodoBtn) {
    addTodoBtn.addEventListener('click', () => {
        const text = newTodoInput.value.trim();
        if (!text) return;

        const dateKey = window.selectedDateStr || new Date().toLocaleDateString('en-CA');
        const todos = JSON.parse(localStorage.getItem('onStudy_todos_' + dateKey) || '[]');
        todos.push({ text: text, completed: false });
        
        localStorage.setItem('onStudy_todos_' + dateKey, JSON.stringify(todos));
        newTodoInput.value = '';
        loadTodos();
    });
}

// Enter tuşuna basınca görev ekleme
if (newTodoInput) {
    newTodoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodoBtn.click();
    });
}

// Görevi tamamlandı olarak işaretleme
window.toggleTodo = function(index) {
    const dateKey = window.selectedDateStr || new Date().toLocaleDateString('en-CA');
    const todos = JSON.parse(localStorage.getItem('onStudy_todos_' + dateKey) || '[]');
    todos[index].completed = !todos[index].completed;
    localStorage.setItem('onStudy_todos_' + dateKey, JSON.stringify(todos));
    loadTodos();
};

// Görevi silme
window.deleteTodo = function(index) {
    const dateKey = window.selectedDateStr || new Date().toLocaleDateString('en-CA');
    const todos = JSON.parse(localStorage.getItem('onStudy_todos_' + dateKey) || '[]');
    todos.splice(index, 1);
    localStorage.setItem('onStudy_todos_' + dateKey, JSON.stringify(todos));
    loadTodos();
};

// Sayfa yüklendiğinde görevleri ekrana bas
document.addEventListener('DOMContentLoaded', loadTodos);