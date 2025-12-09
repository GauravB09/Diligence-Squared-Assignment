import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Conversation } from '@elevenlabs/client';
import { SURVEY_CONFIG } from '../config';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
// In Vite, env vars must be prefixed with VITE_
const ELEVENLABS_AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID;

/**
 * Interview component that uses ElevenLabs HTML embed widget to create a connection to the AI agent
 * and starts a conversation using the userId.
 *
 * @param {string} userId - The user ID to start the conversation with
 * @param {string} segment - The user's segment (e.g., "Customer", "Potential Customer", "Terminated")
 */
const Interview = ({ userId, segment }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState(null);
    const [previousTranscript, setPreviousTranscript] = useState(null);
    const [isFinishing, setIsFinishing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isComplete, setIsComplete] = useState(false);
    const [canResume, setCanResume] = useState(false);
    const conversationRef = useRef(null);

    // Check for existing transcript and completion status on component mount
    useEffect(() => {
      const checkExistingTranscript = async () => {
        setIsLoading(true);

        if (!userId) {
          setIsLoading(false);
          return;
        }

        try {
          // Get session info including accumulated transcript (all previous sessions combined)
          const sessionResponse = await axios.get(`${API_BASE_URL}/api/interview/session/${userId}`);
          const { transcript: existingTranscript } = sessionResponse.data;

          if (existingTranscript && existingTranscript.trim()) {
            // existingTranscript contains all accumulated transcripts from previous sessions
            // Check if conversation is complete
            try {
              const completionResponse = await axios.get(`${API_BASE_URL}/api/interview/check-completion/${userId}`);
              const { is_complete } = completionResponse.data;

              setIsComplete(is_complete);

              if (is_complete) {
                // Conversation is complete, show accumulated transcript
                setTranscript(existingTranscript);
              } else {
                // Conversation is incomplete, can resume with accumulated transcript
                setPreviousTranscript(existingTranscript);
                setCanResume(true);
                setTranscript(null); // Don't show transcript view, allow resumption
              }
            } catch (error) {
              console.error('Error checking completion:', error);
              // If check fails, assume incomplete and allow resume with accumulated transcript
              setPreviousTranscript(existingTranscript);
              setCanResume(true);
            }
          }
        } catch (error) {
          console.error('Error checking for existing transcript:', error);
        } finally {
          setIsLoading(false);
        }
      };

      checkExistingTranscript();
    }, [userId]);

    // Add spinner animation styles
    useEffect(() => {
      const styleSheet = document.createElement("style");
      styleSheet.innerText = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(styleSheet);
      return () => {
        if (document.head.contains(styleSheet)) {
          document.head.removeChild(styleSheet);
        }
      };
    }, []);

    // Auto-save transcript when user closes the tab or refreshes
    useEffect(() => {
        const handleTabClose = () => {
          // Only attempt to save if we actually have an active conversation
          if (isConnected && userId) {
            // We use 'fetch' with 'keepalive: true' because standard axios requests
            // are killed immediately when the page unloads.
            fetch(`${API_BASE_URL}/api/interview/complete/${userId}`, {
              method: 'POST',
              keepalive: true,
              headers: {
                'Content-Type': 'application/json',
              },
            }).catch(err => console.error("Auto-save failed:", err));
          }
        };

        // Add the listener
        window.addEventListener('beforeunload', handleTabClose);

        // Cleanup
        return () => {
          window.removeEventListener('beforeunload', handleTabClose);
        };
      }, [userId, isConnected]);

    // Cleanup on unmount to stop audio if user navigates away
    useEffect(() => {
      return () => {
        if (conversationRef.current) {
          conversationRef.current.endSession();
        }
      };
    }, []);

    const handleStart = async () => {
      try {
        if (!ELEVENLABS_AGENT_ID) {
            alert('ELEVENLABS_AGENT_ID is not configured. Please set VITE_ELEVENLABS_AGENT_ID in your environment.');
          return;
        }

        // 1. Request Microphone Permission explicitly
        await navigator.mediaDevices.getUserMedia({ audio: true });

        // 2. Prepare dynamic variables for the conversation
        const dynamicVariables = {
          _user_segment_: segment || "General"
        };

        // Add previous transcript as dynamic variable if it exists (for resuming conversation)
        // This transcript is accumulated from all previous conversation sessions
        if (previousTranscript && previousTranscript.trim()) {
          dynamicVariables._previous_transcript_ = previousTranscript;
        }

        // 3. Initialize Conversation directly from the Client SDK
        const conversationConfig = {
          agentId: ELEVENLABS_AGENT_ID,
          // Passing dynamic variables including segment and previous transcript
          dynamicVariables: dynamicVariables,
          // Callbacks to update UI state
          onConnect: () => {
            setIsConnected(true);
          },
          onDisconnect: () => {
            setIsConnected(false);
            setIsSpeaking(false);
          },
          onError: (error) => {
            console.error('Error:', error);
            alert('Connection error: ' + (error.message || error));
          },
          onModeChange: (mode) => {
            // 'speaking' means the AI is talking, 'listening' means it's waiting for you
            setIsSpeaking(mode.mode === 'speaking');
          },
        };

        const conversation = await Conversation.startSession(conversationConfig);

        conversationRef.current = conversation;

        // 4. Sync the Real Conversation ID to Backend
        // The raw conversation object has the ID immediately available
        const conversationId = conversation.getId();
        if (conversationId) {
          // Update the conversation ID in the database
          await axios.post(`${API_BASE_URL}/api/interview/update-id`, {
            user_id: userId,
            conversation_id: conversationId
          });

          // Note: We keep previousTranscript until the new conversation is fully established
          // It will be cleared when the new transcript is saved
        }

      } catch (err) {
        console.error('Failed to start:', err);
        alert('Failed to start conversation. Please check your microphone permissions.');
      }
    };

    const handleEndInterview = async () => {
      setIsFinishing(true);

      // 1. End the AI Session
      if (conversationRef.current) {
        await conversationRef.current.endSession();
        conversationRef.current = null;
      }

      // 2. Fetch Transcript
      try {
        // Wait a brief moment for ElevenLabs to finalize the log
        await new Promise(r => setTimeout(r, 3000));

        const response = await axios.post(`${API_BASE_URL}/api/interview/complete/${userId}`);
        if (response.data.status === 'success') {
          // Backend returns the full accumulated transcript (all previous + new)
          const accumulatedTranscript = response.data.transcript;
          setTranscript(accumulatedTranscript);

          // Check if conversation is complete
          try {
            const completionResponse = await axios.get(`${API_BASE_URL}/api/interview/check-completion/${userId}`);
            const { is_complete } = completionResponse.data;
            setIsComplete(is_complete);

            if (!is_complete) {
              // If incomplete, allow resumption
              // Store the accumulated transcript so it can be passed to the next conversation
              setPreviousTranscript(accumulatedTranscript);
              setCanResume(true);
              setTranscript(null); // Clear transcript state to show interview interface
              setIsConnected(false); // Reset connection state for resume
            } else {
              // Conversation is complete, clear resume state
              setPreviousTranscript(null);
              setCanResume(false);
            }
          } catch (err) {
            console.error('Error checking completion:', err);
            // On error, assume incomplete and allow resume with accumulated transcript
            setPreviousTranscript(accumulatedTranscript);
            setCanResume(true);
            setTranscript(null);
          }
        }
      } catch (err) {
        console.error('Failed to fetch transcript:', err);
        alert('Interview ended, but could not retrieve transcript.');
      } finally {
        setIsFinishing(false);
      }
    };

    // Periodically check if conversation is complete while connected
    useEffect(() => {
      if (!isConnected || isFinishing) return;

      const checkCompletion = async () => {
        try {
          const response = await axios.get(`${API_BASE_URL}/api/interview/check-completion/${userId}`);
          const { is_complete } = response.data;

          setIsComplete(is_complete);
        } catch (err) {
          console.error('Error checking completion:', err);
        }
      };

      // Check every 30 seconds while conversation is active
      const interval = setInterval(checkCompletion, 30000);
      return () => clearInterval(interval);
    }, [isConnected, isFinishing, userId]);

    // Download transcript as text file
    const downloadTranscript = () => {
      if (!transcript) return;

      const blob = new Blob([transcript], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `interview-transcript-${userId}-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    // Print only the transcript
    const printTranscript = () => {
      if (!transcript) return;

      // Create a new window with only the transcript content
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow pop-ups to print the transcript');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Interview Transcript</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 40px auto;
                padding: 20px;
                line-height: 1.6;
                color: #333;
              }
              h1 {
                color: #2c3e50;
                border-bottom: 2px solid #667eea;
                padding-bottom: 10px;
                margin-bottom: 30px;
              }
              .transcript {
                white-space: pre-wrap;
                background: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                border: 1px solid #e9ecef;
              }
              @media print {
                body { margin: 0; padding: 20px; }
                .transcript { border: none; background: white; }
              }
            </style>
          </head>
          <body>
            <h1>Interview Transcript</h1>
            <div class="transcript">${transcript.replace(/\n/g, '<br>')}</div>
          </body>
        </html>
      `);

      printWindow.document.close();
      printWindow.focus();

      // Wait for content to load before printing
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    };

    // Show loading state while checking for existing transcript
    if (isLoading) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.content}>
              <div style={styles.idleContainer}>
                <div style={styles.spinner}></div>
                <p style={{ color: '#666', marginTop: '20px' }}>Loading...</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // --- RENDER: TRANSCRIPT VIEW ---
    if (transcript) {
      return (
        <div style={styles.container}>
          <div style={styles.transcriptCard}>
            <h2 style={{ color: '#2c3e50', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
              Interview Completed
            </h2>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
              Your interview transcript is available below. You can download or print it.
            </p>
            <div style={styles.transcriptBox}>
              {transcript}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
              <button onClick={downloadTranscript} style={styles.buttonSecondary}>
                Download Transcript
              </button>
              <button onClick={printTranscript} style={styles.buttonSecondary}>
                Print Transcript
              </button>
            </div>
          </div>
        </div>
      );
    }

    // --- RENDER: INTERVIEW VIEW ---
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>{SURVEY_CONFIG.interview.title}</h1>
            <p style={styles.subtitle}>
              {SURVEY_CONFIG.interview.subtitles[segment] || SURVEY_CONFIG.interview.subtitles.default}
            </p>
          </div>

          <div style={styles.content}>
            {isConnected ? (
              // ACTIVE STATE
              <div style={styles.activeContainer}>
                <div style={{
                  ...styles.orb,
                  transform: isSpeaking ? 'scale(1.2)' : 'scale(1)',
                  boxShadow: isSpeaking
                    ? '0 0 50px rgba(102, 126, 234, 0.8)'
                    : '0 0 20px rgba(102, 126, 234, 0.4)'
                }}>
                  <div style={styles.micIcon}>🎙️</div>
                </div>
                <p style={styles.statusText}>
                  {isSpeaking ? 'Agent is speaking...' : 'Listening to you...'}
                </p>
              </div>
            ) : (
              // IDLE STATE
              <div style={styles.idleContainer}>
                <div style={styles.iconLarge}>👋</div>
                <h3>
                  {canResume ? 'Resume Interview' : 'Ready to begin?'}
                </h3>
                <p style={{ color: '#666', maxWidth: '400px' }}>
                  {canResume ? (
                    <>
                      {SURVEY_CONFIG.interview.resumeMessage}
                      <br /><br />
                      <small style={{ fontSize: '12px', color: '#999' }}>
                        Previous conversation will be used as context.
                      </small>
                    </>
                  ) : (
                    SURVEY_CONFIG.interview.welcomeMessage
                  )}
                </p>
                <button onClick={handleStart} style={styles.buttonPrimary}>
                  {canResume ? 'Resume Conversation' : 'Start Conversation'}
                </button>
                <div style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px', width: '100%' }}>
                    <p style={{ fontSize: '13px', color: '#888' }}>
                        Already finished speaking with the AI?
                    </p>
                    <button
                        onClick={() => setTranscript(previousTranscript)} // Force show transcript
                        style={{
                            background: 'transparent',
                            border: '1px solid #ccc',
                            color: '#666',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            marginBottom: '20px'
                        }}
                    >
                        Mark Interview as Complete
                    </button>
                </div>
              </div>
            )}
          </div>

          <div style={styles.footer}>
            {isConnected && (
              <button
                onClick={handleEndInterview}
                disabled={isFinishing}
                style={styles.buttonDanger}
              >
                {isFinishing ? 'Saving...' : 'End Interview'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Styles
  const styles = {
    container: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: '-apple-system, sans-serif',
      padding: '20px',
    },
    card: {
      width: '100%',
      maxWidth: '800px',
      backgroundColor: 'white',
      borderRadius: '24px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '600px',
      height: 'auto',
    },
    header: {
      padding: '30px',
      background: '#f8f9fa',
      borderBottom: '1px solid #eee',
      textAlign: 'center',
    },
    title: { margin: 0, fontSize: '28px', color: '#333' },
    subtitle: { margin: '8px 0 0', color: '#666' },
    content: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    idleContainer: {
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '20px',
    },
    activeContainer: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '40px',
    },
    orb: {
      width: '120px',
      height: '120px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.3s ease',
    },
    micIcon: { fontSize: '40px' },
    iconLarge: { fontSize: '60px', marginBottom: '10px' },
    statusText: { fontSize: '18px', color: '#666', fontWeight: 500 },
    footer: {
      padding: '20px',
      borderTop: '1px solid #eee',
      display: 'flex',
      justifyContent: 'center',
    },
    buttonPrimary: {
      padding: '16px 40px',
      fontSize: '18px',
      background: '#667eea',
      color: 'white',
      border: 'none',
      borderRadius: '50px',
      cursor: 'pointer',
      fontWeight: 'bold',
      boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
    },
    buttonDanger: {
      padding: '12px 30px',
      fontSize: '16px',
      background: '#dc3545',
      color: 'white',
      border: 'none',
      borderRadius: '50px',
      cursor: 'pointer',
      fontWeight: 'bold',
    },
    buttonSecondary: {
      padding: '10px 20px',
      background: '#6c757d',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
    },
    transcriptCard: {
      width: '100%',
      maxWidth: '800px',
      background: 'white',
      padding: '40px',
      borderRadius: '20px',
    },
    transcriptBox: {
      background: '#f8f9fa',
      padding: '20px',
      borderRadius: '10px',
      maxHeight: '400px',
      overflowY: 'auto',
      whiteSpace: 'pre-wrap',
      margin: '20px 0',
      border: '1px solid #eee',
    },
    spinner: {
      width: '40px',
      height: '40px',
      border: '4px solid #f3f3f3',
      borderTop: '4px solid #667eea',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
    },
  };

export default Interview;
