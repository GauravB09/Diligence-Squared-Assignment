import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Conversation } from '@elevenlabs/client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://overclinically-asphaltlike-bernarda.ngrok-free.dev';
const ELEVENLABS_AGENT_ID = 'agent_7501kbwz9masffca24mjt1x1pawb';

/**
 * Interview component that uses ElevenLabs HTML embed widget to create a connection to the AI agent
 * and starts a conversation using the userId.
 *
 * @param {string} userId - The user ID to start the conversation with
 * @param {string} segment - The user's segment (e.g., "Customer", "Potential Customer", "Terminated")
 * @param {string} agentId - Optional ElevenLabs agent ID (defaults to the provided one)
 */
const Interview = ({ userId, segment }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState(null);
    const [isFinishing, setIsFinishing] = useState(false);
    const conversationRef = useRef(null);

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
        // 1. Request Microphone Permission explicitly
        await navigator.mediaDevices.getUserMedia({ audio: true });

        // 2. Initialize Conversation directly from the Client SDK
        const conversation = await Conversation.startSession({
          agentId: ELEVENLABS_AGENT_ID,
          // Passing the dynamic variable for your segmentation logic
          dynamicVariables: {
            _user_segment_: segment || "General"
          },
          // Callbacks to update UI state
          onConnect: () => {
            console.log('Connected to AI');
            setIsConnected(true);
          },
          onDisconnect: () => {
            console.log('Disconnected from AI');
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
        });

        conversationRef.current = conversation;

        // 3. Sync the Real Conversation ID to Backend
        // The raw conversation object has the ID immediately available
        const conversationId = conversation.getId();
        if (conversationId) {
          console.log('Syncing Conversation ID:', conversationId);
          // We use the ID to fetch transcripts later
          await axios.post(`${API_BASE_URL}/api/interview/update-id`, {
            user_id: userId,
            conversation_id: conversationId
          });
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
        await new Promise(r => setTimeout(r, 5000)); // Kept 5s to be safe

        const response = await axios.post(`${API_BASE_URL}/api/interview/complete/${userId}`);
        if (response.data.status === 'success') {
          setTranscript(response.data.transcript);
        }
      } catch (err) {
        console.error('Failed to fetch transcript:', err);
        alert('Interview ended, but could not retrieve transcript.');
      } finally {
        setIsFinishing(false);
      }
    };

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

    // --- RENDER: TRANSCRIPT VIEW ---
    if (transcript) {
      return (
        <div style={styles.container}>
          <div style={styles.transcriptCard}>
            <h2 style={{ color: '#2c3e50', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
              Interview Completed
            </h2>
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
            <h1 style={styles.title}>AI Interview</h1>
            <p style={styles.subtitle}>
              {segment === 'Customer' ? 'BMW Owner Experience' : 'Vehicle Preference Survey'}
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
                <h3>Ready to begin?</h3>
                <p style={{ color: '#666', maxWidth: '400px' }}>
                  I will ask you a few questions about your car preferences.
                  Please speak clearly.
                </p>
                <button onClick={handleStart} style={styles.buttonPrimary}>
                  Start Conversation
                </button>
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
      height: '600px',
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
  };

export default Interview;
