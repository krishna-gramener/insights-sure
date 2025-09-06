# Insight Sure

A minimalistic web application for healthcare claim denial analysis using AI.

## Overview

Insight Sure is a browser-based tool that helps healthcare professionals analyze denial letters and compare them against historical claim data. The application uses Gemini 2.5 Flash LLM to extract structured information from PDF denial letters and provides visual analytics with fuzzy matching against a CSV database of previous claims.

## Features

- **PDF Upload & Viewing**: Upload and view healthcare claim denial letters directly in the browser
- **AI-Powered Extraction**: Extract key information from denial letters using Gemini 2.5 Flash LLM
- **Database Integration**: View and analyze CSV database of previous claims
- **Fuzzy Matching**: Match extracted drug names against database using Fuse.js
- **Visual Analytics**: View charts for payer distribution, insurance coverage types, patient demographics, and claim status
- **Claim Analysis**: See detailed analysis of matched claims with relevant rows
- **AI Summary**: Get an AI-generated summary of the analysis using GPT-5-Mini

## Tech Stack

- **Frontend**: HTML, JavaScript, Bootstrap 5.3
- **PDF Handling**: PDF.js
- **Data Visualization**: Chart.js
- **Fuzzy Search**: Fuse.js
- **AI Integration**: 
  - Gemini 2.5 Flash for PDF extraction
  - GPT-5-Mini for analysis summary

## Getting Started

1. Clone the repository
2. Navigate to the project directory
3. Start a local server:
   ```
   python -m http.server 8000
   ```
4. Open your browser and navigate to `http://localhost:8000`

## Usage

1. Click "Choose File" to upload a denial letter PDF
2. Click "Analyze" to extract information using AI
3. View the extracted information and PDF side by side
4. Explore the claim analysis charts that appear below
5. Click "View Relevant Rows" to see matched claims from the database
6. Review the AI-generated summary for insights and recommendations

## Database Structure

The application expects a CSV file at `/db/denial_df.csv` with the following columns:
- Claim_ID
- Date_of_Service
- Drug_Name
- Payer_Name
- Patient_Age
- Patient_Gender
- Insurance_Coverage_Type
- Claim_Status
- Claim_Amount
- Paid_Amount

## Security Note

This is a client-side application for demonstration purposes. In a production environment:
- API keys should be secured and not exposed in client-side code
- API calls should be routed through a backend service
- Data should be properly sanitized and validated

## License

MIT
