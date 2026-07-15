# Software Engineering Project & Presentation Materials (Updated)
## Course: INFT 258 - SOFTWARE ENGINEERING
### Institution: University of Energy and Natural Resources (UENR)

---

# SECTION A: UENR LIBRATRACK (Library Capacity Tracking System)

## 1. Topic
**UENR LibraTrack**: A Geofenced, Real-time Progressive Web Application (PWA) for Library Occupancy and Capacity Management with Push Notifications.

---

## 2. Problem Statement (3 Points)
1. **Inefficient Study-Time Allocation**: Students have no visibility into current seat occupancy across UENR libraries, resulting in wasted time walking to libraries that are already full.
2. **Lack of Administrative Tools**: Library management operates blindly with no real-time dashboard to monitor crowd levels, toggle library gates (open/close), adjust seat limits, or analyze peak hours.
3. **Logbook Bottlenecks and Fraud**: Traditional pen-and-paper entry sheets create long queues at gates, are vulnerable to proxy check-ins (signing in from hostels), and fail to generate data analytics.

---

## 3. Type of Evolution Laws (Lehman's Laws)
UENR LibraTrack is classified as an **E-type (Embedded/Evolutionary) system** because it is embedded in the real-world operational environment of the UENR campus. According to Manny Lehman's Laws of Software Evolution, it is governed by:

* **Law 1: Continuing Change (Why it applies)**: The library rules, student enrollment numbers, and network infrastructure will continually change. The application must adapt to new browser geolocations, API rules (Supabase), and changing library layouts, or it will become progressively less useful.
* **Law 2: Increasing Complexity (Why it applies)**: As new features are added (like automatic check-out, barcode scanners, or student demographics), the codebase complexity grows. We must actively refactor the code (e.g., separating database sync in `app.js` and notifications in `notifications.js`) to maintain structural integrity.
* **Law 6: Continuing Growth (Why it applies)**: To maintain student satisfaction, the system must continuously expand its functional scope (e.g., adding room reservations, book search/OPAC widgets, and study group logs).

---

## 4. Software Management & Resource Allocation
Our software management strategy is rooted in the **Agile Scrum Framework** to manage tasks incrementally across two-week sprints. To optimize productivity and track deliverables, tasks are allocated to team members using Scrum boards, with daily stand-ups to resolve blockages.

### Resource Collection
To build and deploy this application, we collected and prepared the following resources:
* **Hardware Resources**: Developer workstations/laptops for coding, local staging routers for network latency and offline PWA testing, and GPS-enabled iOS/Android mobile devices for live geofencing validation.
* **Software Resources**: Visual Studio Code as the primary IDE, Git/GitHub for version control and collaborative code hosting, and Python (with PyWebPush libraries) to run the push notification backend.
* **Database Services**: A cloud-hosted Supabase PostgreSQL instance, utilizing dedicated relational tables configured with Row-Level Security (RLS) for the `libraries` schema.
* **API Credentials & Security Keys**: Generated VAPID (Voluntary Application Server Identification) key pairs (`vapid_keys.json`) using a secure key-generation script (`gen_keys.py`) to sign and authorize push notification payloads.

---

## 5. Requirement Gathering
We used four distinct elicitation techniques to gather the system requirements:
* **Questionnaire**: Sent a Google Form survey to 100 students regarding their library habits. 88% reported they struggled to find empty seats during exam weeks.
* **Interview**: Met with the Chief Librarian to gather rules on seating limits (Main Library: 150, Annex: 80, Hall 1: 50, RCEES: 50) and get details on how manual entry sheets are managed.
* **Brainstorming**: Held team brainstorm sessions to solve remote checking fraud. We proposed scanning QR codes at the desk combined with active GPS distance verification.
* **Observation**: Spent 3 hours observing entrance queues, noting that the manual sign-in sheet takes an average of 15 seconds per student, causing severe delays during class turnovers.

---

## 6. Analysis & Methodology
The analysis of gathered requirements was structured using a software development methodology with the following four phases:

```
  Plan ───► Requirement Gathering ───► Testing ───► Functional & Non-Functional Req.
```

### I. Plan
* We created a product backlog, defined user stories, and planned 2-week sprints.
* Focus was placed on delivering a core functional prototype (Check-in + Seat updates) before building secondary systems (Admin toggle, Web Push notifications).

### II. Requirement Gathering
* Requirements were collected from stakeholders, mapped to database entities (`occupants` arrays), and prioritized using the MoSCoW framework.

### III. Testing
* **Geofencing Thresholds**: Tested distance math checks by checking in from different distances. (The 3km radius covers UENR campus but correctly blocks check-in from out-of-town).
* **Realtime Sync**: Simulated multiple clients updating the database simultaneously to verify WebSocket broadcast performance.
* **Push Notifications**: Executed manual post scripts (`test_post.py`) to verify that the Python push server delivers notifications to service-worker listeners.

### IV. Functional and Non-Functional Requirements
* **Functional Requirements (FRs)**:
  * Students must input their ID and choose a library to check in.
  * System must verify current coordinates using browser Geolocation.
  * Occupancy counts must automatically increase upon check-in and decrease upon check-out.
  * Admin must verify settings using PIN `2011` to update seats or reset states.
* **Non-Functional Requirements (NFRs)**:
  * *Real-time Latency*: State changes must update all client browsers in <2 seconds.
  * *Security*: Row Level Security (RLS) on Supabase must restrict database access.
  * *Portability & PWA*: App must be installable via service worker (`sw.js`).

---

## 7. Design (Blue Print) [Use Case Diagram]
The system design focuses on the interactions of the two primary actors (Student, Administrator) with UENR LibraTrack database and API backends.

```mermaid
usecaseDiagram
    actor Student
    actor Administrator
    actor SupabaseDB as "Supabase Database"
    actor PushServer as "Python Push Server"

    Student --> (View Seat Availability)
    Student --> (Check In to Library)
    Student --> (Check Out of Library)
    Student --> (Subscribe to Push Alerts)

    (Check In to Library) ..> (Verify Geofence Location) : <<include>>
    (Check In to Library) --> SupabaseDB : "Write Occupancy Record"

    Administrator --> (Toggle Library Gate Status)
    Administrator --> (Adjust Maximum Capacity)
    Administrator --> (Manually Kick/Checkout Student)
    Administrator --> (Broadcast Push Announcement)

    (Toggle Library Gate Status) ..> (Verify Admin PIN) : <<include>>
    (Adjust Maximum Capacity) ..> (Verify Admin PIN) : <<include>>
    (Broadcast Push Announcement) ..> (Verify Admin PIN) : <<include>>

    Administrator --> SupabaseDB : "Update Library Settings"
    (Broadcast Push Announcement) --> PushServer : "Trigger Send Push"
    PushServer --> Student : "Deliver Push Notification via WebPush"
    SupabaseDB --> Student : "Realtime State Sync"
```

---

## 8. Implementation
* **Frontend**: HTML5, CSS3 (Styling with modern cards, glassmorphism, responsive grids), and Vanilla JS (`app.js`, `admin.js`, `notifications.js`).
* **Database & Synchronization**: Supabase integration. A single subscription channel monitors changes on the `libraries` table.
* **Push Notification Sub-system**:
  * The frontend client registers a push subscription via `serviceWorkerRegistration.pushManager.subscribe`.
  * The subscription details are saved on the Python backend (`server.py`) inside `subscriptions.json`.
  * The python script (`server.py`) triggers web push notifications to the browsers using `pywebpush`.
* **Geofencing Calculation**: Written in JavaScript using the Haversine formula to compute distance in meters from UENR center.

---

## 9. Final Product
The final product is a fully responsive PWA. Key screen modules include:
* **Entry Welcome Screen (`entry.html`)**: Beautiful visual portal with UENR branding and entry buttons.
* **Student Dashboard (`index.html` & `checkin.html`)**: Lists all libraries, capacity percentages, open/closed status badges, and the Geolocation-locked check-in form.
* **Admin Dashboard (`admin.html`)**: Secured screen where administrators adjust seats, kick occupants, and broadcast push notifications.
* **Progressive Installation**: Detects browser capabilities and prompts students to add LibraTrack to their home screens for offline utility.

---
---

# SECTION B: COREATTEND (Student Attendance Tracking System)

## 1. Topic
**CoreAttend**: A Secure, Geofenced Student Attendance Tracking PWA with Real-time Countdowns and Focus-Loss Fraud Protection.

---

## 2. Problem Statement (3 Points)
1. **Proxy Attendance Fraud**: Absent students routinely message classmates to sign attendance rosters on their behalf.
2. **Disruptions to Lectures**: Passing physical paper sheets in large lecture halls (like `INFT 258 - Software Engineering`) causes noise, distraction, and wastes lecture hours.
3. **Heavy Manual Transcription Load**: Lecturers have to spend hours typing handwritten logs from paper sheets into spreadsheets for class grades.

---

## 3. Type of Evolution Laws (Lehman's Laws)
CoreAttend is an **E-type system** operating within the real-world constraints of university classrooms:

* **Law 1: Continuing Change (Why it applies)**: The system must evolve as UENR changes its lecture hall locations, changes grading criteria, or adds new departments.
* **Law 2: Increasing Complexity (Why it applies)**: Adding features like anti-cheating, screen recording prevention, and QR generation increases complexity. We must keep code clean to prevent app failure.
* **Law 7: Declining Quality (Why it applies)**: If the system is not updated to handle newer web security laws (e.g., changes in browser focus events or GPS permissions), students will find loopholes, and the reliability of attendance records will decline.

---

## 4. Software Management & Resource Allocation
Tasks were managed using **Scrum boards** to track tasks through sprints. Development assignments were allocated among the frontend implementation (focus lock/timer interface) and backend integrations (Supabase connections and geolocation math).

### Resource Collection
* **Hardware Resources**: High-performance development laptops, wireless routers to simulate campus network conditions, and multiple Android/iOS test devices for active geofenced check-in verification.
* **Software Resources**: TailwindCSS Framework for rapid and responsive UI development, Vanilla JavaScript for focus-loss detection logic and countdown timers, and Git/GitHub repositories for version control and branching.
* **Database Services**: Supabase cloud instance with dedicated, relational tables (`sessions` and `students`) to log attendance records and active code states in real time.

---

## 5. Requirement Gathering
* **Questionnaire**: Surveyed 60 students; 75% agreed that signing paper registers is slow and messy.
* **Interview**: Interviewed academic lecturers to understand grading structures and attendance constraints.
* **Brainstorming**: Brainstormed ideas to prevent code sharing. We decided on a focus-detection listener: if a student minimizes the tab, the screen gets locked.
* **Observation**: Observed that passing paper rosters takes up to 25 minutes in a class of 150 students, with sheets occasionally getting lost.

---

## 6. Analysis & Methodology
The analysis of requirements followed the standard methodology workflow:

```
  Plan ───► Requirement Gathering ───► Testing ───► Functional & Non-Functional Req.
```

### I. Plan
* Designed student and lecturer workflows. Decided to link submissions to active countdown timers.

### II. Requirement Gathering
* Gathered student fields: Full Name, Index Number, and Class Group (`I.T A` to `I.T E`).

### III. Testing
* Tested session timer expiration (verifying form locks at `00:00`).
* Verified screen blurs immediately on tab switching or screen splitting.

### IV. Functional & Non-Functional Requirements
* **Functional Requirements**:
  * Lecturers must generate a temporary random session code.
  * Students must input valid class codes to load the profile form.
  * System must lock input forms when focus is lost.
* **Non-Functional Requirements**:
  * *Concurrency*: App must process 150+ writes within 60 seconds.
  * *Security*: Focus loss detection overlay and Supabase RLS.

---

## 7. Design (Blue Print) [Use Case Diagram]
The design maps student validations and lecturer operations.

```mermaid
usecaseDiagram
    actor Student
    actor Lecturer
    actor SupabaseDB as "Supabase Database"

    Student --> (Input Code)
    Student --> (Submit Attendance Details)
    
    (Submit Attendance Details) ..> (Verify Geolocation GPS) : <<include>>
    (Submit Attendance Details) ..> (Monitor Browser Tab Focus) : <<include>>
    (Submit Attendance Details) --> SupabaseDB : "Insert Student Record"

    Lecturer --> (Login to Portal)
    Lecturer --> (Initialize Session Code)
    Lecturer --> (Define Countdown Timer)
    Lecturer --> (View Realtime Attendance List)
    Lecturer --> (Close Active Session)

    (Initialize Session Code) --> SupabaseDB : "Create Session Entry"
    (View Realtime Attendance List) <-- SupabaseDB : "Fetch Student List"
```

---

## 8. Implementation
* **Frontend**: HTML5 and TailwindCSS. Custom event listeners capture tab changes.
* **Backend**: Supabase client (`supabaseClient.js`) connects directly to database tables (`sessions`, `students`).
* **Security Mechanics**: Captures window `blur` event triggers to cover screens with a backdrop shield.

---

## 9. Final Product
* **Lecturer Portal**: Generates session code and displays live table of checked-in students.
* **Student portal (`Student-enter-code.html`)**: Prompts for the session code and counts down remaining seconds.
* **Submission Portal (`Students-details.html`)**: Collects credentials with anti-cheating focus monitors active.
