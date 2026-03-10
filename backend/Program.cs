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

// 1. POST: Veriyi kaydet
app.MapPost("/api/sessions", async (StudySession session) =>
{
    try
    {
        Dictionary<string, object> firestoreData = new Dictionary<string, object>
        {
            { "userId", session.UserId ?? "unknown" }, 
            { "subject", session.Subject ?? "Unknown" },
            { "durationInSeconds", session.DurationInSeconds },
            { "date", session.Date ?? DateTime.UtcNow.ToString("o") },
            { "createdAt", FieldValue.ServerTimestamp }
        };

        CollectionReference collection = db.Collection("study_sessions");
        await collection.AddAsync(firestoreData);
        return Results.Ok(new { message = "Data saved to Cloud Database successfully!" });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

// 2. GET: Kullanıcının kendi verilerini getir
app.MapGet("/api/sessions/{userId}", async (string userId) =>
{
    try
    {
        CollectionReference collection = db.Collection("study_sessions");
        QuerySnapshot snapshot = await collection.WhereEqualTo("userId", userId).GetSnapshotAsync();

        List<StudySession> sessions = new List<StudySession>();
        foreach (DocumentSnapshot document in snapshot.Documents)
        {
            if (document.Exists)
            {
                Dictionary<string, object> data = document.ToDictionary();
                sessions.Add(new StudySession
                {
                    UserId = data.ContainsKey("userId") ? data["userId"].ToString() : "",
                    Subject = data.ContainsKey("subject") ? data["subject"].ToString() : "Unknown",
                    DurationInSeconds = data.ContainsKey("durationInSeconds") ? Convert.ToInt32(data["durationInSeconds"]) : 0,
                    Date = data.ContainsKey("date") ? data["date"].ToString() : ""
                });
            }
        }
        var sortedSessions = sessions.OrderByDescending(s => s.Date).Take(10).ToList();
        return Results.Ok(sortedSessions);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

// 3. GET: Kullanıcı profilini getir
app.MapGet("/api/users/{userId}", async (string userId) =>
{
    DocumentReference docRef = db.Collection("users").Document(userId);
    DocumentSnapshot snapshot = await docRef.GetSnapshotAsync();
    
    if (snapshot.Exists) return Results.Ok(snapshot.ToDictionary());
    return Results.NotFound(new { message = "User not found" });
});

// 4. POST: Kullanıcı profilini kaydet (İSİM EKLENDİ)
app.MapPost("/api/users", async (UserProfile profile) =>
{
    DocumentReference docRef = db.Collection("users").Document(profile.UserId);
    Dictionary<string, object> userData = new Dictionary<string, object>
    {
        { "userId", profile.UserId },
        { "displayName", profile.DisplayName ?? "Öğrenci" }, // YENİ
        { "dailyGoalSeconds", profile.DailyGoalSeconds },
        { "streakCount", profile.StreakCount },
        { "lastGoalMetDate", profile.LastGoalMetDate ?? "" }
    };
    
    await docRef.SetAsync(userData, SetOptions.MergeAll);
    return Results.Ok(new { message = "Profile updated!" });
});

// 5. GET: LİDERLİK TABLOSU (Tüm kullanıcıların toplam süreleri yarışıyor)
app.MapGet("/api/leaderboard", async () =>
{
    try
    {
        // 1. Önce tüm oturumları çekip kullanıcı bazında süreleri topluyoruz
        QuerySnapshot sessionsSnap = await db.Collection("study_sessions").GetSnapshotAsync();
        var userTotals = new Dictionary<string, int>();
        
        foreach(var doc in sessionsSnap.Documents) {
            var dict = doc.ToDictionary();
            var uid = dict.ContainsKey("userId") ? dict["userId"].ToString() : "";
            var dur = dict.ContainsKey("durationInSeconds") ? Convert.ToInt32(dict["durationInSeconds"]) : 0;
            if(!string.IsNullOrEmpty(uid)) {
                if(!userTotals.ContainsKey(uid)) userTotals[uid] = 0;
                userTotals[uid] += dur;
            }
        }

        // 2. Kullanıcı isimlerini çekip sürelerle eşleştiriyoruz
        QuerySnapshot usersSnap = await db.Collection("users").GetSnapshotAsync();
        var leaderboard = new List<LeaderboardEntry>();

        foreach(var uDoc in usersSnap.Documents) {
            var uDict = uDoc.ToDictionary();
            var uid = uDict.ContainsKey("userId") ? uDict["userId"].ToString() : "";
            var name = uDict.ContainsKey("displayName") ? uDict["displayName"].ToString() : "Gizli Kullanıcı";
            var total = userTotals.ContainsKey(uid) ? userTotals[uid] : 0;
            
            if(total > 0) {
                leaderboard.Add(new LeaderboardEntry { DisplayName = name, TotalSeconds = total });
            }
        }

        // 3. En çok çalışandan en aza doğru sırala ve ilk 10'u yolla
        return Results.Ok(leaderboard.OrderByDescending(x => x.TotalSeconds).Take(10).ToList());
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

app.Run();

// --- MODELLER ---
public class UserProfile
{
    public string UserId { get; set; } = "";
    public string DisplayName { get; set; } = ""; // Liderlik tablosu için eklendi
    public int DailyGoalSeconds { get; set; }
    public int StreakCount { get; set; }
    public string? LastGoalMetDate { get; set; }
}

public class StudySession
{
    public string? UserId { get; set; }
    public string? Subject { get; set; }
    public int DurationInSeconds { get; set; }
    public string? Date { get; set; }
}

public class LeaderboardEntry
{
    public string DisplayName { get; set; } = "";
    public int TotalSeconds { get; set; }
}