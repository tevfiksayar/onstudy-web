// 1. FIREBASE AYARLARI (import satırları silindi!)
const firebaseConfig = {
  apiKey: "AIzaSyCWhL0d5NWex9XEyA441M9kF9UX8SlM0V8",
  authDomain: "onstudy-1a735.firebaseapp.com",
  projectId: "onstudy-1a735",
  storageBucket: "onstudy-1a735.firebasestorage.app",
  messagingSenderId: "513055184070",
  appId: "1:513055184070:web:038ecc9e2d6ba67b56f3c7",
  measurementId: "G-CG7KEP012P"
};

// Eğer Firebase henüz başlatılmadıysa başlat
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

// 2. HTML ELEMENTLERİNİ SEÇME
const authForm = document.getElementById('auth-form');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const toggleAuth = document.getElementById('toggle-auth');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

// Giriş (Sign In) ve Kayıt (Sign Up) modları arasında geçiş yapmak için bayrak
let isSignUpMode = false;

/// 3. MOD DEĞİŞTİRME (Sign In <-> Sign Up)
toggleAuth.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUpMode = !isSignUpMode;

    if (isSignUpMode) {
        // KAYIT OLMA MODU
        formTitle.textContent = "Kayıt Ol";
        submitBtn.textContent = "Kayıt Ol";
        toggleAuth.innerHTML = "Giriş Yap";
        toggleAuth.parentElement.firstChild.textContent = "Zaten hesabın var mı? ";
    } else {
        // GİRİŞ YAPMA MODU
        formTitle.textContent = "Giriş Yap";
        submitBtn.textContent = "Giriş Yap";
        toggleAuth.innerHTML = "Kayıt Ol";
        toggleAuth.parentElement.firstChild.textContent = "Hesabın yok mu? ";
    }
});

// 4. FORMU GÖNDERME (Firebase ile iletişim)
authForm.addEventListener('submit', (e) => {
    e.preventDefault(); // Sayfanın yenilenmesini engelle
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (isSignUpMode) {
        // YENİ KAYIT (SIGN UP)
        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                console.log("Registered successfully:", userCredential.user);
                alert("Account created! Redirecting to dashboard...");
                window.location.href = "dashboard.html"; // Panele yönlendir
            })
            .catch((error) => {
                alert("Error creating account: " + error.message);
                console.error(error);
            });
    } else {
        // GİRİŞ YAP (SIGN IN)
        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                console.log("Signed in successfully:", userCredential.user);
                window.location.href = "dashboard.html"; // Panele yönlendir
            })
            .catch((error) => {
                alert("Error signing in. Please check your credentials.");
                console.error(error);
            });
    }
});

// 5. OTURUM KONTROLÜ (Zaten giriş yapmışsa direkt panele at)
auth.onAuthStateChanged((user) => {
    if (user) {
        // Kullanıcı zaten giriş yapmış
        // EĞER KODUN BÖYLEYSE (YANLIŞ UX)
    // DOĞRU UX (PROFESYONEL KULLANIM)
    window.location.replace("dashboard.html");
    }
});
// Şifremi Unuttum Fonksiyonu
// Modalı açan fonksiyon
function resetPassword(event) {
    if(event) event.preventDefault();
    document.getElementById('reset-password-modal').style.display = 'flex';
    
    // Eğer giriş alanında bir mail yazılıysa otomatik doldur
    const currentEmail = document.getElementById('email').value;
    if(currentEmail) {
        document.getElementById('reset-email-input').value = currentEmail;
    }
}

// Modalı kapatan fonksiyon
function closeResetModal() {
    document.getElementById('reset-password-modal').style.display = 'none';
}

// Gerçek sıfırlama işlemini yapan fonksiyon
function processResetPassword() {
    const email = document.getElementById('reset-email-input').value;
    const btn = document.getElementById('confirm-reset-btn');

    if (!email) {
        alert("Lütfen e-posta adresinizi girin.");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Gönderiliyor...";

    firebase.auth().sendPasswordResetEmail(email)
        .then(() => {
            alert("Sıfırlama bağlantısı e-posta adresinize gönderildi.");
            closeResetModal();
        })
        .catch((error) => {
            let errorMessage = "Bir hata oluştu.";
            if (error.code === 'auth/user-not-found') errorMessage = "Bu e-posta adresiyle kayıtlı bir hesap bulunamadı.";
            else if (error.code === 'auth/invalid-email') errorMessage = "Geçersiz bir e-posta adresi girdiniz.";
            alert(errorMessage);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerText = "Bağlantı Gönder";
        });
}

// Misafir Girişi (Anonim) Fonksiyonu
function guestLogin() {
    firebase.auth().signInAnonymously()
        .then(() => {
            // Giriş başarılı, replace ile yönlendir (Geri tuşu bug'ını engellemek için)
            window.location.replace("dashboard.html");
        })
        .catch((error) => {
            alert("Misafir girişi başarısız oldu: " + error.message);
        });
}