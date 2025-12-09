# Configuration Guide

This project uses a configuration-based approach to make it adaptable to different types of surveys. All survey-specific settings are centralized in a **single shared JSON configuration file**.

## Configuration File

### Shared Configuration (`config/survey.json`)

A single JSON file that contains all survey-specific settings used by both backend and frontend:

- **Survey Metadata**: Title and description
- **Question Mappings**: Maps TypeForm question titles to internal question keys
- **Segmentation Rules**: Defines how survey answers determine user segments
- **Interview Settings**: Interview titles and messages for each segment
- **Terminated Message**: Message shown to users who don't qualify

### Configuration Loaders

- **Backend** (`backend/config.py`): Loads and exposes the JSON config as `SURVEY_CONFIG`
- **Frontend** (`frontend/src/config.js`): Imports and exports the JSON config as `SURVEY_CONFIG`

Both sides read from the same `config/survey.json` file, ensuring consistency across the application.

## How to Adapt for a New Survey

### Step 1: Update Question Mappings

In `config/survey.json`, update the `questions` section to match your TypeForm questions:

```python
"questions": {
    "age": {
        "partial_title": "How old are you",  # Partial match of your question title
        "type": "choice"  # "choice", "choices", "text", etc.
    },
    "your_question_key": {
        "partial_title": "Your Question Title",
        "type": "choice"
    }
}
```

### Step 2: Update Segmentation Rules

Define how answers map to segments:

```json
"segmentation": {
    "default_segment": "Terminated",
    "default_status": "terminated",
    "rules": [
        {
            "segment": "Qualified",
            "status": "completed",
            "conditions": {
                "age": {
                    "exclude": ["Under 18"],
                    "operator": "not_contains"
                },
                "your_question_key": {
                    "values": ["Expected Answer"],
                    "operator": "in"
                }
            }
        }
    ]
}
```

**Available Operators:**
- `in`: Answer must be in the values list
- `not_contains`: Answer must not contain any exclude values
- `contains`: For list fields, answer list must contain the value
- `contains_any`: For list fields, answer list must contain any of the values
- `equals`: Answer must exactly equal the first value

### Step 3: Update Interview Titles

In `config/survey.json`, update interview titles:

```json
"interview": {
    "title": "AI Interview",
    "subtitles": {
        "Qualified": "Your Survey Title",
        "default": "Default Title"
    },
    "welcomeMessage": "Your welcome message",
    "resumeMessage": "Your resume message"
}
```

### Step 4: Update Survey Title

In `config/survey.json`:

```json
{
  "title": "Your Survey Title",
  "description": "Your survey description"
}
```

### Step 5: Update Terminated Message

In `config/survey.json`:

```json
"terminated": {
    "title": "Thank You",
    "message": "Your custom message here",
    "icon": "🙏"
}
```

## Example: Converting to a Different Survey

### Example: Product Feedback Survey

**Shared Config (`config/survey.json`):**

```json
{
  "title": "Product Feedback Survey",
  "description": "A survey about product usage and satisfaction",
  "questions": {
    "product_usage": {
      "partial_title": "How long have you used",
      "type": "choice"
    },
    "satisfaction": {
      "partial_title": "How satisfied are you",
      "type": "choice"
    }
  },
  "segmentation": {
    "default_segment": "Terminated",
    "default_status": "terminated",
    "rules": [
      {
        "segment": "Power User",
        "status": "completed",
        "conditions": {
          "product_usage": {
            "values": ["More than 1 year"],
            "operator": "in"
          },
          "satisfaction": {
            "values": ["Very Satisfied", "Satisfied"],
            "operator": "in"
          }
        }
      }
    ]
  },
  "interview": {
    "title": "AI Interview",
    "subtitles": {
      "Power User": "Product Experience Interview",
      "default": "Feedback Session"
    },
    "welcomeMessage": "I will ask you about your experience with our product.",
    "resumeMessage": "You have an incomplete interview. We'll resume from where you left off."
  },
  "terminated": {
    "title": "Thank You",
    "message": "We appreciate your feedback.\n\nBased on your responses, you do not meet the criteria for the detailed interview.",
    "icon": "🙏"
  }
}
```

## Testing Your Configuration

1. **Validate JSON Syntax:**
   ```bash
   python3 -m json.tool config/survey.json
   ```

2. **Test Backend Config Loading:**
   ```bash
   cd backend
   python3 -c "from config import SURVEY_CONFIG; print('Config loaded:', SURVEY_CONFIG['title'])"
   ```

3. **Test Segment Logic:**
   ```bash
   cd backend
   python3 -c "from segment_logic import determine_segment; print('Segment logic OK')"
   ```

4. **Test Frontend Config:**
   The frontend config is automatically validated when the app loads. Check browser console for any import errors. The JSON import will fail at build time if the file is invalid.

## Notes

- Question partial titles are case-insensitive and use partial matching
- Segmentation rules are evaluated in order - first match wins
- If no rules match, the default segment is used
- Frontend and backend configs should stay in sync for interview titles
- Always test your configuration with sample survey responses before deploying

