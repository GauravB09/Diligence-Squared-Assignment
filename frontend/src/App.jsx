import { useState, useEffect } from 'react'
import { Routes, Route, useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import './App.css'
import Survey from './components/Survey'
import Interview from './components/Interview'

// Use environment variable or fallback to localhost for dev
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Main App Component with Routing
function App() {
  return (
    <Routes>
      <Route path="/survey/:form_id" element={<SurveyRoute />} />
      <Route path="/" element={<DefaultRoute />} />
    </Routes>
  )
}

// Survey Route Component - handles /survey/:form_id?userId=xxxxxx
function SurveyRoute() {
  const { form_id } = useParams();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId');

  const [finalUserId] = useState(() => {
    if (userId) {
      localStorage.setItem('userId', userId);
      return userId;
    }

    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      return storedUserId;
    }

    const newUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem('userId', newUserId)
    return newUserId
  })

  // Application State
  // Possible states: 'loading', 'survey', 'processing', 'interview', 'terminated'
  const [appState, setAppState] = useState('loading')
  const [userSegment, setUserSegment] = useState(null)

  // Routing Helper Function
  const handleRouting = (status, segment) => {
    const safeStatus = (status || '').toLowerCase();
    const safeSegment = (segment || '').toLowerCase();

    // PRIORITY CHECK: Termination
    if (safeStatus === 'terminated' || safeSegment === 'terminated') {
      setAppState('terminated');
      return;
    }

    // CHECK: Qualified
    if (safeStatus === 'completed' || safeStatus === 'in_progress') {
      setUserSegment(segment); // Keep original casing for UI/Prompt
      setAppState('interview');
      return;
    }

    // Check Pending / Unknown
    if (safeStatus === 'pending') {
      return;
    }

    // Default (Only go to survey if specifically needed, usually on first load)
    if (appState !== 'processing') {
      setAppState('survey');
    }
  };

  // Check Session on Load (Resumption Logic)
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/interview/session/${finalUserId}`);
        const { survey_status, segment } = response.data;

        handleRouting(survey_status, segment);

      } catch (error) {
        if (error.response && error.response.status === 404) {
          // User has no session in DB -> New User
          setAppState('survey');
        } else {
          console.error('Error checking session:', error);
          // Fallback to survey on error, or could show error screen
          setAppState('survey');
        }
      }
    };

    checkSession();
  }, [finalUserId, appState]);

  // Handle Survey Submission (The "Processing" Step)
  const handleFormSubmit = async (event) => {
    setAppState('processing');

    // Poll the backend until the webhook updates the status
    // We try 10 times with 2-second intervals
    let attempts = 0;
    const maxAttempts = 60;

    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        const response = await axios.get(`${API_BASE_URL}/api/interview/session/${finalUserId}`);
        const { survey_status, segment } = response.data;

        if (survey_status !== 'pending') {
          clearInterval(pollInterval);
          handleRouting(survey_status, segment);
        }
      } catch (e) {
        // Polling waiting for session creation
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        setAppState('timeout_error');
      }
    }, 1000);
  }

  // Render Views
  if (appState === 'loading') {
    return (
      <div style={styles.container}>
        <div className="loader">Loading session...</div>
      </div>
    );
  }

  if (appState === 'processing') {
    return (
      <div style={styles.container}>
        <h2>Analyzing your responses...</h2>
        <p>Please wait while we prepare your next step.</p>
        <div style={styles.spinner}></div>
      </div>
    );
  }

  if (appState === 'terminated') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🙏</div>
          <h1 style={{ color: '#2c3e50', marginBottom: '15px' }}>Thank You</h1>
          <p style={{ color: '#666', lineHeight: '1.6', marginBottom: '30px' }}>
            We appreciate you taking the time to complete our survey.
            <br/><br/>
            Based on your responses, you do not meet the specific criteria required for the
            voice interview stage of this particular study.
          </p>
          <div style={{ fontSize: '12px', color: '#999', marginTop: '20px' }}>
            You may close this window.
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'timeout_error') {
    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <h2>Status Check Timed Out</h2>
                <p>We received your survey, but the system is taking longer than expected to process the results.</p>
                <button
                    onClick={() => window.location.reload()}
                    style={styles.button}
                >
                    Check Again / Refresh
                </button>
            </div>
        </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      {appState === 'survey' ? (
        <>
          <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>Car Ownership Study</h1>
          <Survey
            formId={form_id || "g5SbNP3q"}
            userId={finalUserId}
            onSubmit={handleFormSubmit}
          />
        </>
      ) : (
        <Interview
          userId={finalUserId}
          segment={userSegment}
        />
      )}
    </div>
  )
}

// Default Route Component (for root path)
function DefaultRoute() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1>Welcome</h1>
        <p>Please use the survey route: <code>/survey/:form_id?userId=xxxxxx</code></p>
      </div>
    </div>
  )
}

// Basic styles for rapid prototyping
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    fontFamily: 'Arial, sans-serif',
    padding: '20px',
  },
  card: {
    padding: '40px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    maxWidth: '600px',
    textAlign: 'center',
  },
  spinner: {
    margin: '20px auto',
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #3498db',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  button: {
    marginTop: '20px',
    padding: '10px 20px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  }
};

// Add global style for keyframes if not present in CSS
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
`;
document.head.appendChild(styleSheet);

export default App
