using Google.Cloud.Firestore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options => {
    options.AddPolicy("AllowAll", policy => {
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
    });
});

var app = builder.Build();
app.UseCors("AllowAll");

// --- YENİ AKILLI VERİTABANI BAĞLANTISI ---
string projectId = "onstudy-1a735"; 
FirestoreDb db;

string firebaseJson = Environment.GetEnvironmentVariable("FIREBASE_JSON");

if (!string.IsNullOrEmpty(firebaseJson)) {
    // SUNUCU (CANLI) MODU: Şifreyi çevre değişkeninden okur.
    db = new FirestoreDbBuilder {
        ProjectId = projectId,
        JsonCredentials = firebaseJson
    }.Build();
} else {
    // LOKAL (BİLGİSAYAR) MODU: Kendi bilgisayarındaki json dosyasını kullanır.
    string filepath = "firebase-key.json";
    Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", filepath);
    db = FirestoreDb.Create(projectId);
}
// ----------------------------------------

// 1. SESSIONS 
app.MapPost("/api/sessions", async (StudySession session) => {
    Dictionary<string, object> data = new() {
        { "userId", session.UserId ?? "unknown" }, 
        { "subject", session.Subject ?? "Unknown" },
        { "durationInSeconds", session.DurationInSeconds },
        { "date", session.Date ?? DateTime.UtcNow.ToString("o") },
        { "createdAt", FieldValue.ServerTimestamp }
    };
    await db.Collection("study_sessions").AddAsync(data);
    return Results.Ok(new { message = "Saved!" });
});

app.MapGet("/api/sessions/{userId}", async (string userId) => {
    QuerySnapshot snap = await db.Collection("study_sessions").WhereEqualTo("userId", userId).GetSnapshotAsync();
    var sessions = snap.Documents.Select(d => {
        var dict = d.ToDictionary();
        return new StudySession {
            Id = d.Id, 
            UserId = dict.ContainsKey("userId") ? dict["userId"].ToString() : "",
            Subject = dict.ContainsKey("subject") ? dict["subject"].ToString() : "Unknown",
            DurationInSeconds = dict.ContainsKey("durationInSeconds") ? Convert.ToInt32(dict["durationInSeconds"]) : 0,
            Date = dict.ContainsKey("date") ? dict["date"].ToString() : ""
        };
    }).OrderByDescending(s => s.Date).Take(10).ToList();
    return Results.Ok(sessions);
});

app.MapDelete("/api/sessions/{id}", async (string id) => {
    await db.Collection("study_sessions").Document(id).DeleteAsync();
    return Results.Ok();
});

// 2. USERS 
app.MapGet("/api/users/{userId}", async (string userId) => {
    var snap = await db.Collection("users").Document(userId).GetSnapshotAsync();
    return snap.Exists ? Results.Ok(snap.ToDictionary()) : Results.NotFound();
});

app.MapPost("/api/users", async (UserProfile profile) => {
    Dictionary<string, object> data = new() {
        { "userId", profile.UserId },
        { "displayName", profile.DisplayName ?? "Öğrenci" },
        { "dailyGoalSeconds", profile.DailyGoalSeconds },
        { "streakCount", profile.StreakCount },
        { "lastGoalMetDate", profile.LastGoalMetDate ?? "" },
        { "targetExam", profile.TargetExam ?? "Genel" }
    };
    await db.Collection("users").Document(profile.UserId).SetAsync(data, SetOptions.MergeAll);
    return Results.Ok();
});

app.MapDelete("/api/users/{userId}/reset", async (string userId) => {
    var sessions = await db.Collection("study_sessions").WhereEqualTo("userId", userId).GetSnapshotAsync();
    foreach (var doc in sessions.Documents) await doc.Reference.DeleteAsync();
    var todos = await db.Collection("todos").WhereEqualTo("userId", userId).GetSnapshotAsync();
    foreach (var doc in todos.Documents) await doc.Reference.DeleteAsync();
    await db.Collection("users").Document(userId).UpdateAsync(new Dictionary<string, object> {
        { "streakCount", 0 }, { "lastGoalMetDate", "" }
    });
    return Results.Ok();
});

// 3. LEADERBOARD 
app.MapGet("/api/leaderboard/{exam}", async (string exam) => {
    QuerySnapshot usersSnap = await db.Collection("users").WhereEqualTo("targetExam", exam).GetSnapshotAsync();
    var examUserIds = usersSnap.Documents.Select(d => d.Id).ToList();
    if(!examUserIds.Any()) return Results.Ok(new List<LeaderboardEntry>());

    QuerySnapshot sessionsSnap = await db.Collection("study_sessions").GetSnapshotAsync();
    var userTotals = new Dictionary<string, int>();
    foreach(var doc in sessionsSnap.Documents) {
        var dict = doc.ToDictionary();
        var uid = dict.ContainsKey("userId") ? dict["userId"].ToString() : "";
        var dur = dict.ContainsKey("durationInSeconds") ? Convert.ToInt32(dict["durationInSeconds"]) : 0;
        if(examUserIds.Contains(uid)) {
            if(!userTotals.ContainsKey(uid)) userTotals[uid] = 0;
            userTotals[uid] += dur;
        }
    }
    var leaderboard = usersSnap.Documents.Select(u => {
        var uDict = u.ToDictionary();
        var uid = u.Id;
        var name = uDict.ContainsKey("displayName") ? uDict["displayName"].ToString() : "Gizli";
        var total = userTotals.ContainsKey(uid) ? userTotals[uid] : 0;
        return new LeaderboardEntry { DisplayName = name, TotalSeconds = total };
    }).Where(x => x.TotalSeconds > 0).OrderByDescending(x => x.TotalSeconds).Take(10).ToList();
    return Results.Ok(leaderboard);
});

// 4. TO-DO 
app.MapGet("/api/todos/{userId}/{date}", async (string userId, string date) => {
    QuerySnapshot snap = await db.Collection("todos")
        .WhereEqualTo("userId", userId)
        .WhereEqualTo("date", date)
        .GetSnapshotAsync();
        
    var todos = snap.Documents.Select(d => {
        var dict = d.ToDictionary();
        return new TodoItem { 
            Id = d.Id, 
            UserId = userId, 
            Title = dict.ContainsKey("title") ? dict["title"].ToString() : "", 
            IsCompleted = dict.ContainsKey("isCompleted") && Convert.ToBoolean(dict["isCompleted"]),
            Date = dict.ContainsKey("date") ? dict["date"].ToString() : ""
        };
    }).ToList();
    return Results.Ok(todos);
});

app.MapPost("/api/todos", async (TodoItem todo) => {
    Dictionary<string, object> data = new() { 
        { "userId", todo.UserId }, 
        { "title", todo.Title }, 
        { "isCompleted", todo.IsCompleted }, 
        { "date", todo.Date }, 
        { "createdAt", FieldValue.ServerTimestamp } 
    };
    await db.Collection("todos").AddAsync(data);
    return Results.Ok();
});

app.MapPut("/api/todos/{id}", async (string id, TodoItem todo) => {
    await db.Collection("todos").Document(id).UpdateAsync("isCompleted", todo.IsCompleted);
    return Results.Ok();
});

app.MapDelete("/api/todos/{id}", async (string id) => {
    await db.Collection("todos").Document(id).DeleteAsync();
    return Results.Ok();
});

// 5. SANAL KÜTÜPHANE 
app.MapPost("/api/live/join", async (LiveUser user) => {
    Dictionary<string, object> data = new() {
        { "userId", user.UserId ?? "unknown" },
        { "displayName", user.DisplayName ?? "Öğrenci" },
        { "exam", user.Exam ?? "Genel" },
        { "subject", user.Subject ?? "Ders Çalışıyor" },
        { "startedAt", FieldValue.ServerTimestamp }
    };
    await db.Collection("live_users").Document(user.UserId ?? "unknown").SetAsync(data);
    return Results.Ok();
});

app.MapPost("/api/live/leave", async (LiveUser user) => {
    if (!string.IsNullOrEmpty(user.UserId)) {
        await db.Collection("live_users").Document(user.UserId).DeleteAsync();
    }
    return Results.Ok();
});

app.MapGet("/api/live/{exam}", async (string exam) => {
    try {
        QuerySnapshot snap = await db.Collection("live_users").WhereEqualTo("exam", exam).GetSnapshotAsync();
        var liveUsers = snap.Documents.Select(d => {
            var dict = d.ToDictionary();
            return new LiveUser {
                UserId = dict.ContainsKey("userId") ? dict["userId"]?.ToString() ?? "" : "",
                DisplayName = dict.ContainsKey("displayName") ? dict["displayName"]?.ToString() ?? "Öğrenci" : "Öğrenci",
                Exam = dict.ContainsKey("exam") ? dict["exam"]?.ToString() ?? "Genel" : "Genel",
                Subject = dict.ContainsKey("subject") ? dict["subject"]?.ToString() ?? "Ders Çalışıyor" : "Ders Çalışıyor"
            };
        }).ToList();
        return Results.Ok(liveUsers);
    } 
    catch (Exception ex) {
        Console.WriteLine("Sanal Kütüphane Çekilirken Hata: " + ex.Message);
        return Results.Ok(new List<LiveUser>()); 
    }
});

app.MapPost("/api/pokes", async (Poke poke) => {
    Dictionary<string, object> data = new() {
        { "toUserId", poke.ToUserId },
        { "fromUserName", poke.FromUserName },
        { "timestamp", FieldValue.ServerTimestamp }
    };
    await db.Collection("pokes").AddAsync(data);
    return Results.Ok();
});

app.MapGet("/api/pokes/{userId}", async (string userId) => {
    QuerySnapshot snap = await db.Collection("pokes").WhereEqualTo("toUserId", userId).GetSnapshotAsync();
    var pokes = new List<Poke>();
    foreach (var doc in snap.Documents) {
        var dict = doc.ToDictionary();
        pokes.Add(new Poke {
            Id = doc.Id,
            ToUserId = userId,
            FromUserName = dict.ContainsKey("fromUserName") ? dict["fromUserName"].ToString() : "Biri"
        });
        await doc.Reference.DeleteAsync();
    }
    return Results.Ok(pokes);
});

// --- 6. GELİŞMİŞ GRUP ODALARI VE LOBİ ---
app.MapGet("/api/rooms", async () => {
    QuerySnapshot snap = await db.Collection("active_rooms").GetSnapshotAsync();
    var rooms = new List<object>();
    foreach (var doc in snap.Documents) {
        var dict = doc.ToDictionary();
        var usersSnap = await db.Collection("private_users").WhereEqualTo("roomId", doc.Id).GetSnapshotAsync();
        
        rooms.Add(new {
            RoomId = doc.Id,
            Name = dict.ContainsKey("name") ? dict["name"].ToString() : "Oda",
            IsLocked = dict.ContainsKey("isLocked") ? Convert.ToBoolean(dict["isLocked"]) : false,
            Creator = dict.ContainsKey("creator") ? dict["creator"].ToString() : "Biri",
            UserCount = usersSnap.Documents.Count
        });
    }
    return Results.Ok(rooms);
});

app.MapPost("/api/rooms", async (CreateRoomReq req) => {
    Dictionary<string, object> data = new() {
        { "name", req.Name },
        { "isLocked", !string.IsNullOrEmpty(req.Password) },
        { "password", req.Password ?? "" },
        { "creator", req.Creator },
        { "createdAt", FieldValue.ServerTimestamp }
    };
    var doc = await db.Collection("active_rooms").AddAsync(data);
    return Results.Ok(new { RoomId = doc.Id });
});

app.MapPost("/api/rooms/verify", async (VerifyRoomReq req) => {
    var doc = await db.Collection("active_rooms").Document(req.RoomId).GetSnapshotAsync();
    if(!doc.Exists) return Results.BadRequest();
    var dict = doc.ToDictionary();
    var truePass = dict.ContainsKey("password") ? dict["password"].ToString() : "";
    if(truePass == req.Password) return Results.Ok();
    return Results.BadRequest();
});

app.MapPost("/api/private/join", async (PrivateRoomUser user) => {
    Dictionary<string, object> data = new() { 
        { "userId", user.UserId ?? "unknown" }, 
        { "displayName", user.DisplayName ?? "Öğrenci" }, 
        { "roomId", user.RoomId ?? "genel" },
        { "lastSeen", FieldValue.ServerTimestamp } // YENİ: Zombi odaları temizlemek için
    };
    await db.Collection("private_users").Document(user.UserId ?? "unknown").SetAsync(data);
    return Results.Ok();
});

app.MapPost("/api/private/leave", async (PrivateRoomUser user) => {
    if (!string.IsNullOrEmpty(user.UserId)) {
        await db.Collection("private_users").Document(user.UserId).DeleteAsync();
        
        if (!string.IsNullOrEmpty(user.RoomId)) {
            var remainingUsers = await db.Collection("private_users").WhereEqualTo("roomId", user.RoomId).GetSnapshotAsync();
            if (remainingUsers.Documents.Count == 0) {
                await db.Collection("active_rooms").Document(user.RoomId).DeleteAsync();
                var oldChats = await db.Collection("private_chats").WhereEqualTo("roomId", user.RoomId).GetSnapshotAsync();
                foreach (var chat in oldChats.Documents) {
                    await chat.Reference.DeleteAsync();
                }
            }
        }
    }
    return Results.Ok();
});

app.MapGet("/api/private/{roomId}/users", async (string roomId) => {
    QuerySnapshot snap = await db.Collection("private_users").WhereEqualTo("roomId", roomId).GetSnapshotAsync();
    var users = snap.Documents.Select(d => { 
        var dict = d.ToDictionary(); 
        return new PrivateRoomUser { 
            UserId = dict.ContainsKey("userId") ? dict["userId"].ToString() : "", 
            DisplayName = dict.ContainsKey("displayName") ? dict["displayName"].ToString() : "Gizli" 
        }; 
    }).ToList();
    return Results.Ok(users);
});

app.MapPost("/api/private/chat", async (ChatMessage msg) => {
    Dictionary<string, object> data = new() { 
        { "roomId", msg.RoomId }, 
        { "senderName", msg.SenderName }, 
        { "text", msg.Text }, 
        { "timestamp", FieldValue.ServerTimestamp } 
    };
    await db.Collection("private_chats").AddAsync(data);
    return Results.Ok();
});

app.MapGet("/api/private/{roomId}/chat", async (string roomId) => {
    QuerySnapshot snap = await db.Collection("private_chats").WhereEqualTo("roomId", roomId).GetSnapshotAsync();

    var msgs = snap.Documents.Select(d => {
        var dict = d.ToDictionary();
        DateTime time = DateTime.MinValue;
        if (dict.ContainsKey("timestamp") && dict["timestamp"] is Google.Cloud.Firestore.Timestamp ts) {
            time = ts.ToDateTime();
        }
        return new {
            SenderName = dict.ContainsKey("senderName") ? dict["senderName"]?.ToString() : "Biri",
            Text = dict.ContainsKey("text") ? dict["text"]?.ToString() : "",
            Time = time
        };
    })
    .OrderBy(x => x.Time) 
    .TakeLast(30) 
    .Select(x => new ChatMessage { SenderName = x.SenderName, Text = x.Text })
    .ToList();

    return Results.Ok(msgs);
});

// --- YENİ: KALP ATIŞI VE SÜPÜRGE METODLARI ---

// Kalp atışını yakalar ve lastSeen süresini günceller
app.MapPost("/api/private/heartbeat", async (HeartbeatRequest req) => {
    if (!string.IsNullOrEmpty(req.UserId)) {
        await db.Collection("private_users").Document(req.UserId).UpdateAsync("lastSeen", FieldValue.ServerTimestamp);
    }
    return Results.Ok();
});

// Otomatik temizlik fonksiyonu
app.MapPost("/api/private/cleanup", async () => {
    // 5 dakika öncesinin zaman damgası
    Timestamp threshold = Timestamp.FromDateTime(DateTime.UtcNow.AddMinutes(-5));

    // 1. Aktif olmayan kullanıcıları bul ve sil
    var inactiveUsers = await db.Collection("private_users")
                                .WhereLessThan("lastSeen", threshold) // DÜZELTİLDİ
                                .GetSnapshotAsync();

    foreach (var doc in inactiveUsers.Documents) {
        await doc.Reference.DeleteAsync();
    }

    // 2. İçinde kimse kalmayan odaları bul ve sil
    var rooms = await db.Collection("active_rooms").GetSnapshotAsync(); // DÜZELTİLDİ: "active_rooms" olmalıydı
    foreach (var roomDoc in rooms.Documents) {
        var roomId = roomDoc.Id;
        var usersInRoom = await db.Collection("private_users")
                                   .WhereEqualTo("roomId", roomId) // DÜZELTİLDİ: "roomId" olmalıydı
                                   .GetSnapshotAsync();
        
        if (usersInRoom.Count == 0) {
            await roomDoc.Reference.DeleteAsync();
            // Odaların mesajlarını da silebiliriz (İsteğe bağlı temizlik)
            var oldChats = await db.Collection("private_chats").WhereEqualTo("roomId", roomId).GetSnapshotAsync();
            foreach (var chat in oldChats.Documents) {
                await chat.Reference.DeleteAsync();
            }
        }
    }
    return Results.Ok(new { message = "Temizlik tamamlandı." });
});

app.Run();

// MODELLER
public class UserProfile { public string UserId { get; set; } = ""; public string DisplayName { get; set; } = ""; public int DailyGoalSeconds { get; set; } public int StreakCount { get; set; } public string? LastGoalMetDate { get; set; } public string TargetExam { get; set; } = "Genel"; }
public class StudySession { public string? Id { get; set; } public string? UserId { get; set; } public string? Subject { get; set; } public int DurationInSeconds { get; set; } public string? Date { get; set; } }
public class LeaderboardEntry { public string DisplayName { get; set; } = ""; public int TotalSeconds { get; set; } }
public class TodoItem { public string? Id { get; set; } public string? UserId { get; set; } public string? Title { get; set; } public bool IsCompleted { get; set; } public string? Date { get; set; } }
public class LiveUser { public string? UserId { get; set; } public string? DisplayName { get; set; } public string? Exam { get; set; } public string? Subject { get; set; } }
public class Poke { public string? Id { get; set; } public string ToUserId { get; set; } = ""; public string FromUserName { get; set; } = ""; }
public class PrivateRoomUser { public string? UserId { get; set; } public string? DisplayName { get; set; } public string? RoomId { get; set; } }
public class ChatMessage { public string? RoomId { get; set; } public string? SenderName { get; set; } public string? Text { get; set; } }
public class CreateRoomReq { public string Name { get; set; } = ""; public string? Password { get; set; } public string Creator { get; set; } = ""; }
public class VerifyRoomReq { public string RoomId { get; set; } = ""; public string? Password { get; set; } }
public class HeartbeatRequest { public string UserId { get; set; } = ""; public string RoomId { get; set; } = ""; } 