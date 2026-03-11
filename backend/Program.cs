using Google.Cloud.Firestore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options => {
    options.AddPolicy("AllowAll", policy => {
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
    });
});

var app = builder.Build();
app.UseCors("AllowAll");

string filepath = "firebase-key.json";
Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", filepath);
string projectId = "onstudy-1a735"; 
FirestoreDb db = FirestoreDb.Create(projectId);

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

// 4. TO-DO (TARİHE GÖRE FİLTRELENMİŞ YENİ VERSİYON)
app.MapGet("/api/todos/{userId}/{date}", async (string userId, string date) => {
    // Sadece o günün tarihine sahip görevleri getir!
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
        { "date", todo.Date }, // YENİ: Hangi güne eklendiği
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


// --- 5. SANAL KÜTÜPHANE (LIVE ROOMS - HATA KORUMALI) ---
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
                // KeyNotFound hatasını önlemek için güvenli veri çekimi:
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
        return Results.Ok(new List<LiveUser>()); // Çökmek yerine boş liste dön
    }
});
// --- YENİ EKLENDİ: ATEŞ GÖNDERME (POKES) ---
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
    // Kullanıcıya gelen ateşleri bul
    QuerySnapshot snap = await db.Collection("pokes").WhereEqualTo("toUserId", userId).GetSnapshotAsync();
    var pokes = new List<Poke>();
    
    foreach (var doc in snap.Documents) {
        var dict = doc.ToDictionary();
        pokes.Add(new Poke {
            Id = doc.Id,
            ToUserId = userId,
            FromUserName = dict.ContainsKey("fromUserName") ? dict["fromUserName"].ToString() : "Biri"
        });
        // Karşı taraf ateşi görünce veritabanından sil ki sürekli aynı ateş çıkmasın
        await doc.Reference.DeleteAsync();
    }
    return Results.Ok(pokes);
});

app.Run();

/// MODELLER (En alttaki modeller listene bunu da ekle)
public class UserProfile { public string UserId { get; set; } = ""; public string DisplayName { get; set; } = ""; public int DailyGoalSeconds { get; set; } public int StreakCount { get; set; } public string? LastGoalMetDate { get; set; } public string TargetExam { get; set; } = "Genel"; }
public class StudySession { public string? Id { get; set; } public string? UserId { get; set; } public string? Subject { get; set; } public int DurationInSeconds { get; set; } public string? Date { get; set; } }
public class LeaderboardEntry { public string DisplayName { get; set; } = ""; public int TotalSeconds { get; set; } }
public class TodoItem { public string? Id { get; set; } public string? UserId { get; set; } public string? Title { get; set; } public bool IsCompleted { get; set; } public string? Date { get; set; } }
public class LiveUser { public string? UserId { get; set; } public string? DisplayName { get; set; } public string? Exam { get; set; } public string? Subject { get; set; } }
// BURA YENİ:
public class Poke { public string? Id { get; set; } public string ToUserId { get; set; } = ""; public string FromUserName { get; set; } = ""; }