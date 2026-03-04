using Google.Cloud.Firestore;

var builder = WebApplication.CreateBuilder(args);

// 1. CORS Settings
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
    });
});

var app = builder.Build();
app.UseCors("AllowAll");

// 2. FIREBASE BAĞLANTISI (Sihrin gerçekleştiği yer)
// İndirdiğin gizli anahtar dosyasını okuyoruz
string filepath = "firebase-key.json";
Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", filepath);

// Senin Firebase projenin ID'si
string projectId = "onstudy-1a735"; 
FirestoreDb db = FirestoreDb.Create(projectId);

// 3. POST Endpoint (Veriyi alıp Firestore'a yazan kısım)
app.MapPost("/api/sessions", async (StudySession session) =>
{
    Console.WriteLine("===============================================");
    Console.WriteLine($"🎉 NEW STUDY SESSION RECEIVED!");
    Console.WriteLine($"📚 Subject: {session.Subject}");
    Console.WriteLine($"⏱️ Duration: {session.DurationInSeconds} seconds");
    
    try
    {
        // Firestore'a gidecek veriyi bir sözlük (Dictionary) formatına çeviriyoruz
        Dictionary<string, object> firestoreData = new Dictionary<string, object>
        {
            { "subject", session.Subject ?? "Unknown Subject" },
            { "durationInSeconds", session.DurationInSeconds },
            { "date", session.Date ?? DateTime.UtcNow.ToString("o") },
            { "createdAt", FieldValue.ServerTimestamp }
        };

        // "study_sessions" adında bir koleksiyona (tabloya) bu veriyi ekliyoruz
        CollectionReference collection = db.Collection("study_sessions");
        await collection.AddAsync(firestoreData);

        Console.WriteLine("✅ Data successfully saved to Firestore!");
        Console.WriteLine("===============================================");
        
        return Results.Ok(new { message = "Data saved to Cloud Database successfully!" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"❌ FIRESTORE ERROR: {ex.Message}");
        return Results.Problem("Veritabanına kaydedilirken bir hata oluştu.");
    }
});
// 4. GET Endpoint (Fetch data from Firestore to display on the Frontend)
app.MapGet("/api/sessions", async () =>
{
    try
    {
        // "study_sessions" tablosuna bağlanıyoruz
        CollectionReference collection = db.Collection("study_sessions");
        
        // Verileri en yeniden en eskiye (tarihe göre) sıralayıp son 10 kaydı çekiyoruz
        QuerySnapshot snapshot = await collection.OrderByDescending("createdAt").Limit(10).GetSnapshotAsync();

        List<StudySession> sessions = new List<StudySession>();

        // Gelen her bir satırı (dokümanı) kendi formatımıza çeviriyoruz
        foreach (DocumentSnapshot document in snapshot.Documents)
        {
            if (document.Exists)
            {
                Dictionary<string, object> data = document.ToDictionary();
                sessions.Add(new StudySession
                {
                    Subject = data.ContainsKey("subject") ? data["subject"].ToString() : "Unknown",
                    DurationInSeconds = data.ContainsKey("durationInSeconds") ? Convert.ToInt32(data["durationInSeconds"]) : 0,
                    Date = data.ContainsKey("date") ? data["date"].ToString() : ""
                });
            }
        }

        Console.WriteLine($"✅ Successfully fetched {sessions.Count} sessions from Firestore.");
        return Results.Ok(sessions);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"❌ FIRESTORE GET ERROR: {ex.Message}");
        return Results.Problem("Error fetching data from database.");
    }
});
app.Run();

// 4. Model (Frontend'den gelen verinin kalıbı)
public class StudySession
{
    public string? Subject { get; set; }
    public int DurationInSeconds { get; set; }
    public string? Date { get; set; }
}