// Global variables
let pdfData = null;
let csvData = null;
let extractedData = null;
let charts = {};
let API_KEY='';

async function init() {
    try {
      // Get API token
      const response = await fetch("https://llmfoundry.straive.com/token", { credentials: "include" });
      const data = await response.json();
      API_KEY = data.token;
    } catch (error) {
      console.error('Initialization error:', error);
      alert('Failed to initialize application: ' + error.message);
    }
  }

  init();
// DOM elements
const pdfFileInput = document.getElementById('pdfFile');
const analyzeBtn = document.getElementById('analyzeBtn');
const viewDbBtn = document.getElementById('viewDbBtn');
const loader = document.getElementById('loader');
const extractedInfo = document.getElementById('extractedInfo');
const noDataMessage = document.getElementById('noDataMessage');
const viewPdfBtn = document.getElementById('viewPdfBtn');

// Modal elements - initialize them after DOM is fully loaded
let dbModal;
let relevantRowsModal;
let pdfViewerModal;

// Store matched claims for later use
let matchedClaims = [];

// Event listeners
pdfFileInput.addEventListener('change', handleFileSelect);
analyzeBtn.addEventListener('click', analyzePDF);
viewDbBtn.addEventListener('click', viewDatabase);
viewPdfBtn.addEventListener('click', viewPdfInModal);

// Add event listener for the View Relevant Rows button
document.addEventListener('DOMContentLoaded', () => {
    const viewRowsBtn = document.getElementById('viewRowsBtn');
    if (viewRowsBtn) {
        viewRowsBtn.addEventListener('click', showRelevantRows);
    }
});

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Initialize modals
        dbModal = new bootstrap.Modal(document.getElementById('dbModal'));
        relevantRowsModal = new bootstrap.Modal(document.getElementById('relevantRowsModal'));
        pdfViewerModal = new bootstrap.Modal(document.getElementById('pdfViewerModal'));
        
        // Load CSV data
        loadCSVData();
        
        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Error initializing application:', error);
    }
});

// Handle file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        // Store the PDF URL for later use in modal
        const objectURL = URL.createObjectURL(file);
        
        // Show the View PDF button
        viewPdfBtn.classList.remove('d-none');
        
        // Set the source for the modal iframe
        document.getElementById('pdfViewerModal-iframe').src = objectURL;
        
        // Convert PDF to base64 for API
        const reader = new FileReader();
        reader.onload = function(e) {
            pdfData = e.target.result.split(',')[1]; // Remove data URL prefix
        };
        reader.readAsDataURL(file);
    }
}

// Analyze PDF using Gemini API
async function analyzePDF() {
    if (!pdfData) {
        alert('Please upload a PDF file first');
        return;
    }
    
    // Show loader, hide other elements
    loader.classList.remove('d-none');
    extractedInfo.classList.add('d-none');
    noDataMessage.classList.add('d-none');
    
    try {
        const response = await callLLM(pdfData);
        displayExtractedInfo(response);
    } catch (error) {
        console.error('Error analyzing PDF:', error);
        alert('Error analyzing PDF. Please try again.');
    } finally {
        loader.classList.add('d-none');
    }
}

async function callLLM(base64PDF) {
    const API_URL = 'https://llmfoundry.straive.com/gemini/v1beta/models/gemini-2.5-flash:generateContent';
    
    const systemPrompt = `
    You are an AI assistant specialized in extracting information from healthcare claim denial letters.
    Extract the following information from the provided PDF document and organize it into these sections:
    
    1. Payer & Administrative Details:
       - Payer Name
       - Payer Address
       - Date of Letter
       - Level of Review
    
    2. Member Information:
       - Member Name
       - Member ID
       - Date of Birth
    
    3. Provider & Claim Information:
       - Provider Name
       - Provider NPI
       - Request/Claim Number
       - Requested Service
       - HCPCS Code
       - Coverage Determination
    
    4. Denial & Policy Rationale:
       - Denial Reason(s)
       - Rationale Category
       - Policy Reference
       - Policy Review Date
       - Sources Cited
    
    5. Appeals & Review:
       - Appeal Window
       - Appeal Options
       - Appeal Timelines
       - Reviewer Name
       - Reviewer Role
    
    Format your response STRICTLY as a JSON object with the following structure:
    {
        "payerDetails": {
            "payerName": "Insurance Company Name",
            "payerAddress": "Full address",
            "dateOfLetter": "YYYY-MM-DD",
            "levelOfReview": "Level description"
        },
        "memberInfo": {
            "memberName": "Full Name",
            "memberId": "ID123456",
            "dateOfBirth": "YYYY-MM-DD"
        },
        "providerInfo": {
            "providerName": "Dr. Name",
            "providerNpi": "1234567890",
            "claimNumber": "CLAIM123456",
            "drugName": "Drug Name",
            "hcpcsCode": "J1234",
            "coverageDetermination": "APPROVED/DENIED"
        },
        "denialInfo": {
            "denialReasons": "Full denial reasons",
            "rationaleCategory": "Category description",
            "policyReference": "Policy number/name",
            "policyReviewDate": "YYYY-MM-DD",
            "sourcesCited": "Sources cited in the letter"
        },
        "appealInfo": {
            "appealWindow": "Time period",
            "appealOptions": "Available options",
            "appealTimelines": "Timeline details",
            "reviewerName": "Reviewer's name",
            "reviewerRole": "Reviewer's position"
        }
    }
    
    If you cannot find specific information for string fields, use "Not found in document".
    For array fields (disease and drugName), use an empty array [] if no information is found.
    DO NOT include any explanations or text outside of the JSON structure.
    `;
    
    try {
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}:insights-sure`
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: systemPrompt },
                            { inlineData: { mimeType: 'application/pdf', data: base64PDF } }
                        ]
                    }
                ]
            })
        });
        
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        
        // Try to parse the response as JSON
        try {
            // Check if the response is wrapped in ```json ``` code blocks
            let jsonStr = text;
            
            // Remove code block markers if present
            const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch && codeBlockMatch[1]) {
                jsonStr = codeBlockMatch[1].trim();
            } else {
                // If not in code blocks, try to extract JSON directly
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    jsonStr = jsonMatch[0];
                }
            }
            
            const parsedData = JSON.parse(jsonStr);
            return parsedData;
        } catch (jsonError) {
            console.error('Error parsing JSON response:', jsonError);
            
            // Fallback: Try to extract information from unstructured text using the new data structure
            const fallbackData = {
                payerDetails: {
                    payerName: extractValue(text, 'payer name|insurance company', 'Not found'),
                    payerAddress: extractValue(text, 'payer address|address', 'Not found'),
                    dateOfLetter: extractValue(text, 'date of letter|letter date', 'Not found'),
                    levelOfReview: extractValue(text, 'level of review|review level', 'Not found')
                },
                memberInfo: {
                    memberName: extractValue(text, 'member name|patient name', 'Not found'),
                    memberId: extractValue(text, 'member id|insurance id', 'Not found'),
                    dateOfBirth: extractValue(text, 'date of birth|birth date|dob', 'Not found')
                },
                providerInfo: {
                    providerName: extractValue(text, 'provider name|doctor name', 'Not found'),
                    providerNpi: extractValue(text, 'provider npi|npi', 'Not found'),
                    claimNumber: extractValue(text, 'claim number|request number', 'Not found'),
                    requestedService: extractValue(text, 'requested service|service|drug name|medication', 'Not found'),
                    hcpcsCode: extractValue(text, 'hcpcs code|cpt code', 'Not found'),
                    coverageDetermination: extractValue(text, 'coverage determination|determination', 'Not found')
                },
                denialInfo: {
                    denialReasons: extractValue(text, 'denial reason|reason for denial', 'Not found'),
                    rationaleCategory: extractValue(text, 'rationale category|category', 'Not found'),
                    policyReference: extractValue(text, 'policy reference|reference', 'Not found'),
                    policyReviewDate: extractValue(text, 'policy review date|review date', 'Not found'),
                    sourcesCited: extractValue(text, 'sources cited|sources', 'Not found')
                },
                appealInfo: {
                    appealWindow: extractValue(text, 'appeal window|window', 'Not found'),
                    appealOptions: extractValue(text, 'appeal options|options', 'Not found'),
                    appealTimelines: extractValue(text, 'appeal timelines|timelines', 'Not found'),
                    reviewerName: extractValue(text, 'reviewer name|reviewer', 'Not found'),
                    reviewerRole: extractValue(text, 'reviewer role|role', 'Not found')
                }
            };
            
            return fallbackData;
        }
    } catch (error) {
        console.error('Error analyzing PDF:', error);
        showNotification(`Error analyzing PDF: ${error.message}`, true);
        throw error;
    }
}

// Call OpenAI API to generate a summary of the analysis
async function callOpenAI(extractedData, matchedClaims) {
    
    try {
        // Prepare the system prompt
        const systemPrompt = `
        You are an AI assistant specialized in analyzing healthcare claim data and providing insights.
        You will be given extracted information from a denial letter and matched claims from a database.
        Provide a concise, professional summary of the analysis that includes:
        
        1. Key information about the denial (date, patient, drug, reason)
        2. Patterns observed in similar claims (approval rates, common payers, demographics)
        3. Actionable insights or recommendations based on the data
        
        Format your response in clear paragraphs with bullet points where appropriate.
        Keep your response focused, informative, and under 300 words.
        `;
        
        // Prepare the user message with the analysis data
        const userMessage = `
        Here is the extracted information from the denial letter:
        ${JSON.stringify(extractedData, null, 2)}
        
        Here are the matched claims from our database (${matchedClaims.length} claims):
        ${JSON.stringify(matchedClaims, null, 2)}
        
        Please provide a summary of this analysis.
        `;
        
        // Call the OpenAI API
        const response = await fetch("https://llmfoundry.straive.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${API_KEY}:insights-sure`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-5-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage },
                ],
            }),
        });
        
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message || "API error occurred");
        }
        
        // Get the response content
        let content = data.choices?.[0]?.message?.content || "No summary could be generated";
        
        // Remove any code block markers if present
        const codeBlockMatch = content.match(/```(?:json|markdown)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
            content = codeBlockMatch[1].trim();
        }
        
        // Format the response with markdown
        return content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        return `<p class="text-danger">Error generating summary: ${error.message}</p>`;
    }
}

// Parse unstructured text response
function parseUnstructuredResponse(text) {
    // Simple parsing logic - in a real app, this would be more sophisticated
    const result = {
        date: extractInfo(text, ['date:', 'date of service:', 'service date:'], 'Could not extract'),
        memberName: extractInfo(text, ['member name:', 'patient name:', 'name:'], 'Could not extract'),
        memberId: extractInfo(text, ['member id:', 'id:', 'member number:'], 'Could not extract'),
        hcpcsCode: extractInfo(text, ['hcpcs code:', 'hcpcs:', 'procedure code:'], 'Could not extract'),
        disease: extractArrayInfo(text, ['disease:', 'diagnosis:', 'condition:']),
        drugName: extractArrayInfo(text, ['drug name:', 'drug:', 'medication:']),
        denialReason: extractInfo(text, ['denial reason:', 'reason for denial:', 'summary:'], 'Could not extract')
    };
    
    return result;
}

// Helper function to extract array information from text
function extractArrayInfo(text, possibleLabels) {
    const extractedText = extractInfo(text, possibleLabels, '');
    
    if (!extractedText || extractedText === 'Could not extract') {
        return [];
    }
    
    // Split by commas, semicolons, or 'and' to get individual items
    const items = extractedText.split(/[,;]|\sand\s/).map(item => item.trim()).filter(Boolean);
    return items.length > 0 ? items : [];
}

// Helper function to extract information from text
function extractInfo(text, possibleLabels, defaultValue) {
    const lowerText = text.toLowerCase();
    
    for (const label of possibleLabels) {
        const index = lowerText.indexOf(label);
        if (index !== -1) {
            // Extract text after the label until the next line break or period
            const startPos = index + label.length;
            const endPos = Math.min(
                lowerText.indexOf('\n', startPos) !== -1 ? lowerText.indexOf('\n', startPos) : Infinity,
                lowerText.indexOf('.', startPos) !== -1 ? lowerText.indexOf('.', startPos) : Infinity
            );
            
            if (endPos !== Infinity) {
                return text.substring(startPos, endPos).trim();
            } else {
                return text.substring(startPos).trim();
            }
        }
    }
    
    return defaultValue;
}

// Display extracted information in the UI
function displayExtractedInfo(data) {
    // Save the extracted data for later use
    extractedData = data;
    
    try {
        // Update Payer & Administrative Details
        if (data.payerDetails) {
            document.getElementById('payerName').textContent = data.payerDetails.payerName || '-';
            document.getElementById('payerAddress').textContent = data.payerDetails.payerAddress || '-';
            document.getElementById('dateOfLetter').textContent = data.payerDetails.dateOfLetter || '-';
            document.getElementById('levelOfReview').textContent = data.payerDetails.levelOfReview || '-';
        }
        
        // Update Member Information
        if (data.memberInfo) {
            document.getElementById('memberName').textContent = data.memberInfo.memberName || '-';
            document.getElementById('memberId').textContent = data.memberInfo.memberId || '-';
            document.getElementById('dateOfBirth').textContent = data.memberInfo.dateOfBirth || '-';
        }
        
        // Update Provider & Claim Information
        if (data.providerInfo) {
            document.getElementById('providerName').textContent = data.providerInfo.providerName || '-';
            document.getElementById('providerNpi').textContent = data.providerInfo.providerNpi || '-';
            document.getElementById('claimNumber').textContent = data.providerInfo.claimNumber || '-';
            document.getElementById('requestedService').textContent = data.providerInfo.drugName || '-';
            document.getElementById('hcpcsCode').textContent = data.providerInfo.hcpcsCode || '-';
            document.getElementById('coverageDetermination').textContent = data.providerInfo.coverageDetermination || '-';
        }
        
        // Update Denial & Policy Rationale
        if (data.denialInfo) {
            document.getElementById('denialReasons').textContent = data.denialInfo.denialReasons || '-';
            document.getElementById('rationaleCategory').textContent = data.denialInfo.rationaleCategory || '-';
            document.getElementById('policyReference').textContent = data.denialInfo.policyReference || '-';
            document.getElementById('policyReviewDate').textContent = data.denialInfo.policyReviewDate || '-';
            document.getElementById('sourcesCited').textContent = data.denialInfo.sourcesCited || '-';
        }
        
        // Update Appeals & Review
        if (data.appealInfo) {
            document.getElementById('appealWindow').textContent = data.appealInfo.appealWindow || '-';
            document.getElementById('appealOptions').textContent = data.appealInfo.appealOptions || '-';
            document.getElementById('appealTimelines').textContent = data.appealInfo.appealTimelines || '-';
            document.getElementById('reviewerName').textContent = data.appealInfo.reviewerName || '-';
            document.getElementById('reviewerRole').textContent = data.appealInfo.reviewerRole || '-';
        }
        
        // Show the extracted info section
        extractedInfo.classList.remove('d-none');
        noDataMessage.classList.add('d-none');
        
        // If we have CSV data and requested service, perform analysis
        if (csvData && data.providerInfo && data.providerInfo.drugName) {
            // Show the analysis section
            const analysisSection = document.getElementById('analysisSection');
            if (analysisSection) {
                analysisSection.classList.remove('d-none');
            }
            
            // Perform the analysis and create charts
            performAnalysis(data);
        }
    } catch (error) {
        console.error('Error in displayExtractedInfo:', error);
    }
}

// Add a simple notification system
function showNotification(message, isError = false) {
    const notificationDiv = document.createElement('div');
    notificationDiv.className = `alert ${isError ? 'alert-danger' : 'alert-success'} alert-dismissible fade show`;
    notificationDiv.role = 'alert';
    notificationDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Add to the top of the container
    const container = document.querySelector('.container');
    container.insertBefore(notificationDiv, container.firstChild);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        notificationDiv.classList.remove('show');
        setTimeout(() => notificationDiv.remove(), 150);
    }, 5000);
}

// Load CSV data from the server
async function loadCSVData() {
    try {
        const response = await fetch('db/denial_df.csv');
        if (!response.ok) {
            throw new Error(`Failed to load CSV data: ${response.status}`);
        }
        
        const csvText = await response.text();
        csvData = parseCSV(csvText);
        
        // Check if risk tab is active and update the risk analysis
        if (document.getElementById('risk-analysis')?.classList.contains('active')) {
            const selectedFactor = document.getElementById('riskFactorSelect')?.value || 'gender';
            createRiskAnalysis(csvData, selectedFactor);
        }
    } catch (error) {
        console.error('Error loading CSV data:', error);
        showNotification('Failed to load database. Please check the console for details.', true);
    }
}

// Parse CSV text into an array of objects
function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');
    
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // Skip empty lines
        
        const values = lines[i].split(',');
        const row = {};
        
        for (let j = 0; j < headers.length; j++) {
            // Make sure we have a value for this column
            if (j < values.length) {
                // Convert numeric values to numbers
                if (headers[j] === 'Risk_Score' || headers[j] === 'Patient_Age' || 
                    headers[j] === 'Claim_Amount' || headers[j] === 'Paid_Amount') {
                    row[headers[j]] = parseFloat(values[j]) || 0;
                } else {
                    row[headers[j]] = values[j];
                }
            } else {
                row[headers[j]] = '';
            }
        }
        
        result.push(row);
    }
    
    return result;
}

// View database in modal
function viewDatabase() {
    if (!csvData || csvData.length === 0) {
        showNotification('Database is not loaded or is empty.', true);
        return;
    }
    
    // Get table elements
    const tableHead = document.querySelector('#dbTable thead');
    const tableBody = document.querySelector('#dbTable tbody');
    
    // Clear previous content
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
    
    // Add headers
    const headerRow = document.createElement('tr');
    Object.keys(csvData[0]).forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    tableHead.appendChild(headerRow);
    
    // Add data rows (limit to 100 rows for performance)
    const maxRows = Math.min(csvData.length, 100);
    for (let i = 0; i < maxRows; i++) {
        const row = document.createElement('tr');
        Object.values(csvData[i]).forEach(value => {
            const td = document.createElement('td');
            td.textContent = value || '-';
            row.appendChild(td);
        });
        tableBody.appendChild(row);
    }
    
    // Show the modal
    dbModal.show();
}

// Perform analysis on extracted data
async function performAnalysis(data) {
    if (!csvData || !data.providerInfo || !data.providerInfo.drugName) {
        console.log('Cannot perform analysis: missing data');
        return;
    }
    
    // Get search terms to match (requested service and HCPCS code)
    const searchTerms = [];
    
    // Add requested service to search terms
    if (data.providerInfo.drugName && data.providerInfo.drugName !== 'Not found') {
        searchTerms.push(data.providerInfo.drugName);
    }
    
    if (searchTerms.length === 0) {
        console.log('No valid search terms to analyze');
        return;
    }
     
    // Set up Fuse.js for fuzzy matching
    const fuseOptions = {
        keys: ['Drug_Name'],
        threshold: 0.7, // Lower threshold means more strict matching
        includeScore: true
    };
    
    const fuse = new Fuse(csvData, fuseOptions);
    
    // Find matches for each search term
    let allMatches = [];
    searchTerms.forEach(term => {
        const matches = fuse.search(term);
        allMatches = [...allMatches, ...matches];
    });
    
    // Sort by score (lower is better) and remove duplicates
    allMatches.sort((a, b) => a.score - b.score);
    matchedClaims = []; // Clear previous matches
    const seenIds = new Set();
    
    allMatches.forEach(match => {
        if (!seenIds.has(match.item.Claim_ID)) {
            matchedClaims.push(match.item);
            seenIds.add(match.item.Claim_ID);
        }
    });
    
    // Update the matched claims count in the button
    const viewRowsBtn = document.getElementById('viewRowsBtn');
    if (viewRowsBtn) {
        if (matchedClaims.length > 0) {
            viewRowsBtn.textContent = `View Relevant Rows (${matchedClaims.length})`;
            viewRowsBtn.disabled = false;
        } else {
            viewRowsBtn.textContent = 'No Relevant Rows Found';
            viewRowsBtn.disabled = true;
        }
    }
    
    // Create charts for analysis
    createAnalysisCharts(matchedClaims);
    
    // Show the summary section
    const summarySection = document.getElementById('summarySection');
    if (summarySection) {
        summarySection.classList.remove('d-none');
    }
    
    // Generate summary using OpenAI
    try {
        // Show the loader
        const summaryLoader = document.getElementById('summaryLoader');
        if (summaryLoader) {
            summaryLoader.classList.remove('d-none');
        }
        
        // Generate the summary
        const summary = await callOpenAI(data, matchedClaims);
        
        // Update the summary content
        const summaryContent = document.getElementById('summaryContent');
        if (summaryContent) {
            summaryContent.innerHTML = `<div class="alert alert-light">${summary}</div>`;
        }
    } catch (error) {
        console.error('Error generating summary:', error);
        const summaryContent = document.getElementById('summaryContent');
        if (summaryContent) {
            summaryContent.innerHTML = `<div class="alert alert-danger">Error generating summary: ${error.message}</div>`;
        }
    } finally {
        // Hide the loader
        const summaryLoader = document.getElementById('summaryLoader');
        if (summaryLoader) {
            summaryLoader.classList.add('d-none');
        }
    }
}

// Show relevant rows in modal
function showRelevantRows() {
    if (!matchedClaims || matchedClaims.length === 0) {
        showNotification('No relevant claims found in the database', true);
        return;
    }
    
    // Update the matched claims count
    const matchedClaimsCount = document.getElementById('matchedClaimsCount');
    if (matchedClaimsCount) {
        if (matchedClaims.length > 0) {
            matchedClaimsCount.textContent = `Found ${matchedClaims.length} similar claims in the database`;
            matchedClaimsCount.className = 'alert alert-success mb-3';
        } else {
            matchedClaimsCount.textContent = 'No similar claims found in the database';
            matchedClaimsCount.className = 'alert alert-warning mb-3';
        }
    }
    
    // Populate the matched claims table
    const tableBody = document.querySelector('#matchedClaimsTable tbody');
    if (tableBody) {
        tableBody.innerHTML = '';
        
        matchedClaims.forEach(claim => {
            const row = document.createElement('tr');
            
            const idCell = document.createElement('td');
            idCell.textContent = claim.Claim_ID;
            
            const drugCell = document.createElement('td');
            drugCell.textContent = claim.Drug_Name;
            
            const dateCell = document.createElement('td');
            dateCell.textContent = claim.Date_of_Service || '-';
            
            const claimAmountCell = document.createElement('td');
            claimAmountCell.textContent = `$${parseFloat(claim.Claim_Amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            
            const paidAmountCell = document.createElement('td');
            paidAmountCell.textContent = `$${parseFloat(claim.Paid_Amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            
            const payerCell = document.createElement('td');
            payerCell.textContent = claim.Payer_Name || '-';
            
            const statusCell = document.createElement('td');
            statusCell.textContent = claim.Claim_Status;
            if (claim.Claim_Status === 'Approved') {
                statusCell.className = 'text-success';
            } else if (claim.Claim_Status === 'Denied') {
                statusCell.className = 'text-danger';
            }
            
            row.appendChild(idCell);
            row.appendChild(drugCell);
            row.appendChild(dateCell);
            row.appendChild(claimAmountCell);
            row.appendChild(paidAmountCell);
            row.appendChild(payerCell);
            row.appendChild(statusCell);
            
            tableBody.appendChild(row);
        });
    }
    
    // Show the modal
    relevantRowsModal.show();
}

// Create charts for data analysis
function createAnalysisCharts(matchedClaims) {
    if (!matchedClaims || matchedClaims.length === 0) return;
    
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded');
        showNotification('Error: Chart.js library is not loaded properly', true);
        return;
    }
    
    // Destroy existing charts to prevent duplicates
    Object.values(charts).forEach(chart => {
        if (chart) chart.destroy();
    });
    
    // Clear charts object
    charts = {};
    
    try {
        // 1. Payer Distribution Chart
        createPayerChart(matchedClaims);
        
        // 2. Insurance Coverage Types Chart
        createInsuranceChart(matchedClaims);
        
        // 3. Patient Demographics Chart
        createDemographicsChart(matchedClaims);
        
        // 4. Claim Status Chart
        createStatusChart(matchedClaims);
    } catch (error) {
        console.error('Error creating charts:', error);
        showNotification('Error creating analysis charts. Please check the console for details.', true);
    }
}

// Create all charts with simplified approach
function createPayerChart(claims) {
    try {
        const payerCounts = {};
        claims.forEach(claim => {
            const payer = claim.Payer_Name || 'Unknown';
            payerCounts[payer] = (payerCounts[payer] || 0) + 1;
        });

        const labels = Object.keys(payerCounts);
        const data = Object.values(payerCounts);

        const canvas = document.getElementById('payerChart');
        if (!canvas) {
            console.error('Payer chart canvas not found');
            return;
        }

        const ctx = canvas.getContext('2d');
        charts.payer = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Payer Distribution',
                    data: data,
                    backgroundColor: generateColors(labels.length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 15,
                            padding: 15
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${value} claims (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating payer chart:', error);
    }
}

function createInsuranceChart(claims) {
    try {
        const insuranceCounts = {};
        claims.forEach(claim => {
            const insurance = claim.Insurance_Coverage_Type || 'Unknown';
            insuranceCounts[insurance] = (insuranceCounts[insurance] || 0) + 1;
        });

        const labels = Object.keys(insuranceCounts);
        const data = Object.values(insuranceCounts);

        const canvas = document.getElementById('insuranceChart');
        if (!canvas) {
            console.error('Insurance chart canvas not found');
            return;
        }

        const ctx = canvas.getContext('2d');
        charts.insurance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Insurance Coverage Types',
                    data: data,
                    backgroundColor: generateColors(labels.length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 15,
                            padding: 15
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${value} claims (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating insurance chart:', error);
    }
}

function createDemographicsChart(claims) {
    try {
        // Group by age range and gender
        const ageGroups = {
            '0-20': { Male: 0, Female: 0 },
            '21-40': { Male: 0, Female: 0 },
            '41-60': { Male: 0, Female: 0 },
            '61-80': { Male: 0, Female: 0 },
            '81+': { Male: 0, Female: 0 }
        };

        claims.forEach(claim => {
            const age = parseInt(claim.Patient_Age) || 0;
            const gender = claim.Patient_Gender || 'Unknown';

            let ageGroup;
            if (age <= 20) ageGroup = '0-20';
            else if (age <= 40) ageGroup = '21-40';
            else if (age <= 60) ageGroup = '41-60';
            else if (age <= 80) ageGroup = '61-80';
            else ageGroup = '81+';

            if (gender === 'Male' || gender === 'Female') {
                ageGroups[ageGroup][gender]++;
            }
        });

        const labels = Object.keys(ageGroups);
        const maleData = labels.map(group => ageGroups[group].Male);
        const femaleData = labels.map(group => ageGroups[group].Female);

        const canvas = document.getElementById('demographicsChart');
        if (!canvas) {
            console.error('Demographics chart canvas not found');
            return;
        }

        const ctx = canvas.getContext('2d');
        charts.demographics = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Male',
                        data: maleData,
                        backgroundColor: 'rgba(54, 162, 235, 0.7)'
                    },
                    {
                        label: 'Female',
                        data: femaleData,
                        backgroundColor: 'rgba(255, 99, 132, 0.7)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Patient Demographics by Age and Gender',
                        font: {
                            size: 14
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.raw || 0;
                                return `${label}: ${value} patients`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Age Group'
                        },
                        stacked: true
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Number of Patients'
                        },
                        stacked: true,
                        beginAtZero: true
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating demographics chart:', error);
    }
}

function createStatusChart(claims) {
    try {
        const statusCounts = {};
        claims.forEach(claim => {
            const status = claim.Claim_Status || 'Unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        const labels = Object.keys(statusCounts);
        const data = Object.values(statusCounts);
        
        // Define colors for different statuses
        const colorMap = {
            'Approved': 'rgba(75, 192, 192, 0.7)',
            'Denied': 'rgba(255, 99, 132, 0.7)',
            'Pending/Unknown': 'rgba(255, 206, 86, 0.7)',
            'Unknown': 'rgba(201, 203, 207, 0.7)'
        };
        
        const backgroundColor = labels.map(label => colorMap[label] || 'rgba(153, 102, 255, 0.7)');
        
        const canvas = document.getElementById('statusChart');
        if (!canvas) {
            console.error('Status chart canvas not found');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        charts.status = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Number of Claims',  
                    data: data,
                    backgroundColor: backgroundColor
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,  
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            title: function(tooltipItems) {
                                return tooltipItems[0].label;
                            },
                            label: function(context) {
                                return `Claims: ${context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Claims'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Claim Status'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating status chart:', error);
    }
}

// Generate random colors for charts
// View PDF in modal
function viewPdfInModal() {
    // The iframe source is already set in handleFileSelect
    // Just show the modal
    pdfViewerModal.show();
}

// Generate random colors for charts
function generateColors(count) {
    const colors = [
        'rgba(255, 99, 132, 0.7)',
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)',
        'rgba(153, 102, 255, 0.7)',
        'rgba(255, 159, 64, 0.7)',
        'rgba(199, 199, 199, 0.7)',
        'rgba(83, 102, 255, 0.7)',
        'rgba(40, 159, 64, 0.7)',
        'rgba(210, 99, 132, 0.7)'
    ];
    
    // If we need more colors than in our predefined array, generate them
    if (count > colors.length) {
        for (let i = colors.length; i < count; i++) {
            const r = Math.floor(Math.random() * 255);
            const g = Math.floor(Math.random() * 255);
            const b = Math.floor(Math.random() * 255);
            colors.push(`rgba(${r}, ${g}, ${b}, 0.7)`);
        }
    }
    
    return colors.slice(0, count);
}

// Risk Analysis Tab Functions
let riskScatterChart = null;

// Initialize risk analysis tab
document.addEventListener('DOMContentLoaded', () => {
    // Add event listener for dropdown change
    const riskFactorSelect = document.getElementById('riskFactorSelect');
    if (riskFactorSelect) {
        riskFactorSelect.addEventListener('change', () => {
            if (csvData) {
                createRiskAnalysis(csvData, riskFactorSelect.value);
            }
        });
    }
    
    // Add event listener for tab switch
    const riskTab = document.getElementById('risk-analysis-tab');
    if (riskTab) {
        riskTab.addEventListener('shown.bs.tab', () => {
            if (csvData) {
                const selectedFactor = document.getElementById('riskFactorSelect')?.value || 'gender';
                createRiskAnalysis(csvData, selectedFactor);
            }
        });
    }
});

// Create risk analysis based on selected factor
function createRiskAnalysis(data, factor) {
    // Create scatter plot
    createRiskScatterPlot(data, factor);
    
    // Update summary
    updateRiskSummary(data, factor);
}

// Create risk scatter plot
function createRiskScatterPlot(data, factor) {
    try {
        const canvas = document.getElementById('riskScatterChart');
        if (!canvas) {
            console.error('Risk scatter chart canvas not found');
            return;
        }
        
        // Get field name based on factor
        let fieldName;
        let chartTitle;
        switch (factor) {
            case 'gender':
                fieldName = 'Patient_Gender';
                chartTitle = 'Risk Score by Patient Gender';
                break;
            case 'payer':
                fieldName = 'Payer_Type';
                chartTitle = 'Risk Score by Payer Type';
                break;
            case 'insurance':
                fieldName = 'Insurance_Coverage_Type';
                chartTitle = 'Risk Score by Insurance Coverage Type';
                break;
            default:
                fieldName = 'Patient_Gender';
                chartTitle = 'Risk Score by Patient Gender';
        }
        
        // Prepare data for scatter plot
        const categories = {};
        data.forEach(item => {
            const category = item[fieldName] || 'Unknown';
            const riskScore = parseFloat(item["Risk_Score"]);
            
            if (!isNaN(riskScore)) {
                if (!categories[category]) {
                    categories[category] = [];
                }
                
                categories[category].push({
                    x: riskScore,
                    y: category,
                    label: category
                });
            }
        });
        
        // Create datasets
        const categoryNames = Object.keys(categories);
        const colors = generateColors(categoryNames.length);
        
        const datasets = categoryNames.map((category, index) => {
            return {
                label: category,
                data: categories[category],
                backgroundColor: colors[index],
                pointRadius: 6,
                pointHoverRadius: 8
            };
        });
        
        // Destroy existing chart if it exists
        if (riskScatterChart) {
            riskScatterChart.destroy();
        }
        
        // Create new chart
        const ctx = canvas.getContext('2d');
        riskScatterChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: chartTitle,
                        font: {
                            size: 16
                        }
                    },
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const point = context.raw;
                                return `${point.label}: Risk Score ${point.x}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Risk Score'
                        }
                    },
                    y: {
                        type: 'category',
                        title: {
                            display: true,
                            text: chartTitle.split(' by ')[1]
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating risk scatter plot:', error);
    }
}

// Update risk summary
function updateRiskSummary(data, factor) {
    const summaryElement = document.getElementById('riskAnalysisSummary');
    if (!summaryElement) return;
    
    // Get field name based on factor
    let fieldName;
    let factorLabel;
    switch (factor) {
        case 'gender':
            fieldName = 'Patient_Gender';
            factorLabel = 'Patient Gender';
            break;
        case 'payer':
            fieldName = 'Payer_Type';
            factorLabel = 'Payer Type';
            break;
        case 'insurance':
            fieldName = 'Insurance_Coverage_Type';
            factorLabel = 'Insurance Coverage Type';
            break;
        default:
            fieldName = 'Patient_Gender';
            factorLabel = 'Patient Gender';
    }
    
    // Calculate statistics by category
    const stats = {};
    data.forEach(item => {
        const category = item[fieldName] || 'Unknown';
        const riskScore = parseFloat(item["Risk_Score"]);
        
        if (!isNaN(riskScore)) {
            if (!stats[category]) {
                stats[category] = {
                    count: 0,
                    total: 0,
                    min: Infinity,
                    max: -Infinity
                };
            }
            
            stats[category].count++;
            stats[category].total += riskScore;
            stats[category].min = Math.min(stats[category].min, riskScore);
            stats[category].max = Math.max(stats[category].max, riskScore);
        }
    });
    
    // Calculate averages
    Object.keys(stats).forEach(category => {
        stats[category].average = stats[category].total / stats[category].count;
    });
    
    // Generate summary HTML
    let summaryHTML = `<h5>Risk Score Analysis by ${factorLabel}</h5>`;
    summaryHTML += '<div class="table-responsive"><table class="table table-striped">';
    summaryHTML += '<thead><tr><th>Category</th><th>Count</th><th>Average Risk</th><th>Min Risk</th><th>Max Risk</th></tr></thead>';
    summaryHTML += '<tbody>';
    
    Object.keys(stats).forEach(category => {
        const stat = stats[category];
        summaryHTML += `<tr>
            <td>${category}</td>
            <td>${stat.count}</td>
            <td>${stat.average.toFixed(1)}%</td>
            <td>${stat.min.toFixed(1)}%</td>
            <td>${stat.max.toFixed(1)}%</td>
        </tr>`;
    });
    
    summaryHTML += '</tbody></table></div>';
    
    // Add insights
    const highRiskCategories = Object.keys(stats).filter(cat => stats[cat].average > 50);
    const lowRiskCategories = Object.keys(stats).filter(cat => stats[cat].average < 30);
    
    summaryHTML += '<div class="mt-3">';
    if (highRiskCategories.length > 0) {
        summaryHTML += `<p><strong>High Risk Categories:</strong> ${highRiskCategories.join(', ')} have average risk scores above 50.</p>`;
    }
    if (lowRiskCategories.length > 0) {
        summaryHTML += `<p><strong>Low Risk Categories:</strong> ${lowRiskCategories.join(', ')} have average risk scores below 30.</p>`;
    }
    summaryHTML += '</div>';
    
    // Update the summary element
    summaryElement.innerHTML = summaryHTML;
}
