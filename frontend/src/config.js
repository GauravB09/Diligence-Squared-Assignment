/**
 * Survey Configuration Loader
 *
 * This module loads the survey configuration from the shared JSON file.
 * The configuration file is located at config/survey.json and is shared
 * between backend and frontend.
 */

// Import the JSON config file
// Vite supports JSON imports natively
import surveyConfig from '../../config/survey.json';

// Export as SURVEY_CONFIG for consistency with backend
export const SURVEY_CONFIG = surveyConfig;

// Also export individual parts for convenience
export const {
  title,
  description,
  questions,
  segmentation,
  interview,
  terminated
} = surveyConfig;
