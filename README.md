# QuoteForge – Manufacturing RFQ-to-Quote Costing Platform

**QuoteForge** is a full-stack manufacturing quotation platform designed to streamline the process of converting customer Requests for Quotation (RFQs) into accurate manufacturing cost estimates and professional quotations.

It brings RFQ management, document extraction, manufacturing costing, historical quotation search, routing recommendations, approval workflows, and quotation generation into one platform.

<p align="center">
  <a href="https://quoteforge-beta.vercel.app">Live Application</a> ·
  <a href="https://quoteforge-backend-q59m.onrender.com/docs">API Documentation</a> ·
  <a href="https://github.com/vedantdubey2407/quoteforge">GitHub Repository</a>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Application Workflow](#application-workflow)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Costing Methodology](#costing-methodology)
- [Historical Quotation Intelligence](#historical-quotation-intelligence)
- [Routing Recommendations](#routing-recommendations)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security Considerations](#security-considerations)
- [Future Improvements](#future-improvements)

---

## Overview

Manufacturing companies often handle RFQs through spreadsheets, emails, and disconnected systems. Estimators must manually extract part information, search historical quotations, calculate manufacturing costs, determine routing operations, and prepare quotations.

This process can be time-consuming and difficult to standardize.

QuoteForge addresses this problem by providing a centralized workflow where estimators can manage RFQs, review extracted information, calculate manufacturing costs, use historical quotation data for reference, and generate customer quotations.

The platform is designed to improve quotation consistency, reduce repetitive manual work, and provide better visibility into the quotation lifecycle.

## Key Features

### 1. RFQ Management
- Create and manage customer RFQs.
- Capture part details, material, weight, cycle time, annual volume, and due dates.
- Organize quotation information in a centralized interface.

### 2. Document Upload and Extraction
- Upload supported RFQ documents.
- Extract relevant information from supported PDF and spreadsheet files.
- Identify missing or incomplete fields.
- Allow estimators to review extracted information before using it.

### 3. Manufacturing Costing
- Calculate material costs.
- Calculate scrap costs.
- Calculate machining and processing costs.
- Include overhead, packing, and freight.
- Calculate manufacturing cost and selling price.
- Account for GST and annual quotation value.

### 4. Rate Master Management
- Manage material and machine rates.
- Support effective-dated rate information.
- Maintain costing inputs for quotation calculations.

### 5. Historical Quotation Search
- Import historical quotation records using CSV files.
- Search historical records using relevant part and material information.
- Use historical records as references during estimation.

### 6. Intelligent Routing Recommendations
- Generate suggested manufacturing routing based on similar existing RFQs and historical quotation records.
- Compare relevant part attributes.
- Present recommendations for estimator review.
- Save reviewed routing suggestions.

### 7. Approval Workflow
- Provide an approval workflow for quotations requiring internal review.
- Support the configured approval threshold and role-based workflow.

### 8. Quotation Generation
- Generate quotation PDFs.
- Present costing and quotation information in a structured format.
- Allow users to access generated quotation documents.

---

## Application Workflow

The typical QuoteForge workflow is:

1. **Create RFQ:** The estimator creates an RFQ and enters customer and part information.
2. **Upload Documents:** Relevant RFQ documents are uploaded.
3. **Extract and Review:** Supported document information is extracted and reviewed by the estimator.
4. **Calculate Cost:** The costing engine calculates manufacturing costs using applicable rates and part details.
5. **Check Historical Data:** Similar historical quotations can be searched and reviewed.
6. **Review Routing:** Suggested manufacturing operations are presented for estimator evaluation.
7. **Prepare Quotation:** The estimator saves the quotation and its costing details.
8. **Approval:** Quotations meeting the configured approval conditions are sent through the approval workflow.
9. **Generate PDF:** The quotation can be generated as a PDF document.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Backend | Python, FastAPI |
| Data Validation | Pydantic |
| Database | Supabase / PostgreSQL |
| Authentication | Supabase Auth |
| Document Processing | pypdf, openpyxl, xlrd |
| API Communication | REST APIs |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |

---

## System Architecture

QuoteForge follows a frontend-backend architecture with Supabase providing database and authentication services.

```text
                 USERS
                   |
                   v
          Next.js Frontend
          (React + TypeScript)
                   |
                   v
             FastAPI Backend
                   |
       +-----------+------------+
       |           |            |
       v           v            v
   RFQ APIs    Costing APIs   Routing APIs
       |           |            |
       +-----------+------------+
                   |
                   v
             Supabase
          (PostgreSQL + Auth)
                   |
          +--------+---------+
          |                  |
          v                  v
    Historical Data     Application Data
```

The frontend handles user interaction and application screens. The FastAPI backend handles business logic, data processing, costing, historical quotation operations, and routing recommendations. Supabase provides persistent storage and authentication.

---

## Costing Methodology

QuoteForge uses manufacturing inputs to calculate the estimated cost of producing a part.

The main costing components are:

**1. Material Cost**

```text
Material Cost = Gross Weight × Material Rate
```

**2. Scrap Cost**

```text
Scrap Cost = Material Cost × Scrap Percentage / 100
```

**3. Processing Cost**

```text
Processing Cost = (Cycle Time / 60) × Machine Hour Rate
```

**4. Overhead Cost**

```text
Overhead Cost =
(Material Cost + Scrap Cost + Processing Cost)
× Overhead Percentage / 100
```

**5. Total Manufacturing Cost**

```text
Total Manufacturing Cost =
Material Cost
+ Scrap Cost
+ Processing Cost
+ Overhead Cost
+ Packing Cost
+ Freight Cost
```

**6. Selling Price**

```text
Selling Price =
Total Manufacturing Cost / (1 - Margin Percentage / 100)
```

**7. Annual Quotation Value**

```text
Annual Quotation Value =
Selling Price × Annual Volume
```

GST is calculated separately from the manufacturing cost.

These formulas describe the costing methodology; the actual calculation and rounding behavior are implemented in the backend costing service.

---

## Historical Quotation Intelligence

Historical quotation data helps estimators reference previously quoted parts and manufacturing information.

QuoteForge supports:

- CSV-based historical quotation import.
- Duplicate record handling.
- Search across historical quotation records.
- Matching and retrieving relevant historical information.

The project includes a synthetic historical quotation dataset for demonstration and development purposes. It should not be interpreted as real customer quotation data.

## Routing Recommendations

QuoteForge provides routing suggestions using relevant existing RFQs and historical quotation records.

The recommendation process considers similarities between part attributes, such as:

- Material.
- Part weight.
- Part name.
- Cycle time.

The suggestions are intended to support estimator decision-making. They should be reviewed before being used in a final manufacturing quotation.

---

## Project Structure

```text
quoteforge/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── costing.py
│   │   │   ├── documents.py
│   │   │   ├── historical.py
│   │   │   └── routing.py
│   │   │
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── supabase.py
│   │   │
│   │   ├── schemas/
│   │   │   └── costing.py
│   │   │
│   │   ├── services/
│   │   │   ├── costing.py
│   │   │   ├── document_parser.py
│   │   │   ├── historical_import.py
│   │   │   ├── rfq_extractor.py
│   │   │   └── routing_suggestions.py
│   │   │
│   │   └── main.py
│   │
│   ├── tests/
│   ├── requirements.txt
│   └── quoteforge_synthetic_historical_quotes_1400.csv
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── approvals/
│   │   │   ├── dashboard/
│   │   │   ├── quotes/
│   │   │   ├── rates/
│   │   │   └── rfqs/
│   │   │
│   │   └── lib/
│   │       └── supabase/
│   │
│   ├── package.json
│   └── package-lock.json
│
└── README.md
```

---

## Getting Started

### Prerequisites

Install the following:

- Git
- Node.js and npm
- Python 3.12
- A Supabase project

### 1. Clone the Repository

```bash
git clone https://github.com/vedantdubey2407/quoteforge.git
cd quoteforge
```

### 2. Configure the Backend

Open a terminal:

```powershell
cd backend

python -m venv .venv

.venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

Create a `.env` file inside the `backend` directory:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Add the corresponding values from your Supabase project.

**Important:** Never expose the service-role key in frontend code or commit it to GitHub.

### 3. Configure the Frontend

Open another terminal:

```powershell
cd frontend

npm install
```

Create a `.env.local` file inside the `frontend` directory:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Fill in the appropriate Supabase public configuration values.

### 4. Start the Backend

From the `backend` directory:

```powershell
.venv\Scripts\Activate.ps1

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

Health check:

```text
http://127.0.0.1:8000/health
```

### 5. Start the Frontend

From the `frontend` directory:

```powershell
npm run dev
```

Frontend:

```text
http://localhost:3000
```

---

## Environment Variables

### Backend

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase public/anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend-only privileged Supabase key |

### Frontend

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public/anonymous key |

Never commit actual environment variable values or secret keys.

---

## API Documentation

The backend is built using FastAPI.

When the backend is running locally, interactive API documentation is available at:

```text
http://127.0.0.1:8000/docs
```

Production API documentation:

https://quoteforge-backend-q59m.onrender.com/docs

API groups include:

- Costing
- Document processing
- Historical quotation operations
- Routing recommendations

Refer to the interactive API documentation for the actual endpoint methods, request schemas, and response formats.

---

## Testing

Backend tests are located in:

```text
backend/tests/
```

Run the backend tests using:

```powershell
cd backend
pytest
```

Run a frontend production build using:

```powershell
cd frontend
npm run build
```

These commands can be used to validate the backend test suite and frontend build.

---

## Deployment

QuoteForge is deployed using the following services:

| Component | Hosting | URL |
|---|---|---|
| Frontend | Vercel | https://quoteforge-beta.vercel.app |
| Backend | Render | https://quoteforge-backend-q59m.onrender.com |
| Database | Supabase | https://eehatbllyogjcwhhahxz.supabase.co |

### Frontend Deployment

The frontend is deployed on Vercel.

- Root directory: `frontend`
- Build command: `npm run build`

Configure the required frontend environment variables in Vercel before deployment.

### Backend Deployment

The backend is deployed on Render.

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Configure the required backend environment variables in Render.

### Backend Health Check

https://quoteforge-backend-q59m.onrender.com/health

Expected healthy response:

```json
{
  "status": "healthy"
}
```

---

## Security Considerations

- Environment variables are used to configure application services.
- Privileged Supabase credentials must remain backend-only.
- Frontend configuration must only contain public Supabase credentials.
- Authentication and database access should follow the configured Supabase policies.
- Secret keys, access tokens, and private credentials must never be committed to the public repository.

---

## Future Improvements

Potential future enhancements include:

- OCR and improved drawing title-block extraction.
- More advanced document understanding.
- Improved routing recommendation algorithms.
- Additional approval roles and approval policies.
- Detailed audit logs.
- Advanced quotation analytics.
- Automated integration testing.
- Production monitoring and observability.

These are proposed improvements and should not be interpreted as currently implemented functionality.

---

## Author

**Vedant Dubey**

B.Tech – Artificial Intelligence and Machine Learning

GitHub: https://github.com/vedantdubey2407

---

## License

This project was developed as a software engineering assignment.

Add a license if the project is intended for open-source distribution.
