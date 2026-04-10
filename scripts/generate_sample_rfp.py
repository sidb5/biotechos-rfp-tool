"""
Generates a realistic sample preclinical CRO RFP PDF for testing the RFP input page.
"""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
import os

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "sample-rfp-vertex-oncology.pdf")
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

doc = SimpleDocTemplate(
    OUTPUT_PATH,
    pagesize=letter,
    leftMargin=1*inch,
    rightMargin=1*inch,
    topMargin=1*inch,
    bottomMargin=1*inch,
)

styles = getSampleStyleSheet()

# Custom styles
cover_label   = ParagraphStyle("cover_label",   fontSize=8,  textColor=colors.HexColor("#9ca3af"), spaceAfter=4,  leading=12, fontName="Helvetica")
cover_title   = ParagraphStyle("cover_title",   fontSize=22, textColor=colors.HexColor("#111827"), spaceAfter=6,  leading=28, fontName="Helvetica-Bold")
cover_sub     = ParagraphStyle("cover_sub",     fontSize=10, textColor=colors.HexColor("#6b7280"), spaceAfter=16, leading=16, fontName="Helvetica")
section_head  = ParagraphStyle("section_head",  fontSize=8,  textColor=colors.HexColor("#9ca3af"), spaceAfter=6,  spaceBefore=20, leading=12, fontName="Helvetica-Bold")
body_text     = ParagraphStyle("body_text",     fontSize=10, textColor=colors.HexColor("#374151"), spaceAfter=8,  leading=16, fontName="Helvetica")
bullet_text   = ParagraphStyle("bullet_text",   fontSize=10, textColor=colors.HexColor("#374151"), spaceAfter=4,  leading=16, leftIndent=16, fontName="Helvetica")
bold_text     = ParagraphStyle("bold_text",     fontSize=10, textColor=colors.HexColor("#111827"), spaceAfter=4,  leading=16, fontName="Helvetica-Bold")
note_text     = ParagraphStyle("note_text",     fontSize=9,  textColor=colors.HexColor("#6b7280"), spaceAfter=8,  leading=14, fontName="Helvetica-Oblique")
table_header  = ParagraphStyle("table_header",  fontSize=9,  textColor=colors.white, leading=14, fontName="Helvetica-Bold")
table_cell    = ParagraphStyle("table_cell",    fontSize=9,  textColor=colors.HexColor("#374151"), leading=14, fontName="Helvetica")

GREEN = colors.HexColor("#16a34a")
LIGHT_GRAY = colors.HexColor("#f9fafb")
BORDER_GRAY = colors.HexColor("#e5e7eb")

story = []

# ── Cover block ─────────────────────────────────────────────────────────────
story.append(Paragraph("REQUEST FOR PROPOSAL", cover_label))
story.append(Paragraph("In Vitro Safety Pharmacology &amp; Toxicology Package", cover_title))
story.append(Paragraph(
    "Vertex Oncology Inc. is soliciting proposals from qualified preclinical CROs "
    "to conduct a comprehensive in vitro safety and toxicology screening package "
    "for a novel small-molecule KRAS G12C inhibitor (VOX-4471) currently in IND-enabling studies.",
    cover_sub
))
story.append(HRFlowable(width="100%", thickness=1, color=BORDER_GRAY, spaceAfter=16))

# Meta table
meta_data = [
    ["Issuing company",  "Vertex Oncology Inc."],
    ["Contact",          "Dr. Sarah Chen, Director of Preclinical Development"],
    ["Email",            "s.chen@vertexoncology.com"],
    ["RFP issue date",   "March 28, 2026"],
    ["Proposal deadline","April 18, 2026"],
    ["Target study start","June 2026 (subject to IND submission timeline)"],
]
meta_table = Table(meta_data, colWidths=[2.0*inch, 4.5*inch])
meta_table.setStyle(TableStyle([
    ("FONTNAME",    (0,0), (0,-1), "Helvetica-Bold"),
    ("FONTNAME",    (1,0), (1,-1), "Helvetica"),
    ("FONTSIZE",    (0,0), (-1,-1), 9),
    ("TEXTCOLOR",   (0,0), (0,-1), colors.HexColor("#6b7280")),
    ("TEXTCOLOR",   (1,0), (1,-1), colors.HexColor("#111827")),
    ("ROWBACKGROUNDS", (0,0), (-1,-1), [LIGHT_GRAY, colors.white]),
    ("TOPPADDING",  (0,0), (-1,-1), 6),
    ("BOTTOMPADDING",(0,0), (-1,-1), 6),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("RIGHTPADDING",(0,0), (-1,-1), 8),
    ("GRID",        (0,0), (-1,-1), 0.5, BORDER_GRAY),
    ("ROUNDEDCORNERS", (0,0), (-1,-1), 4),
]))
story.append(meta_table)
story.append(Spacer(1, 20))

# ── 1. Background ────────────────────────────────────────────────────────────
story.append(Paragraph("1. BACKGROUND &amp; COMPOUND OVERVIEW", section_head))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY, spaceAfter=10))
story.append(Paragraph(
    "VOX-4471 is a covalent small-molecule inhibitor targeting the KRAS G12C oncogenic mutation, "
    "relevant across non-small cell lung cancer (NSCLC), colorectal cancer, and pancreatic ductal "
    "adenocarcinoma. The compound has demonstrated sub-nanomolar potency against KRAS G12C in "
    "biochemical assays and shows promising selectivity over wild-type KRAS.",
    body_text
))
story.append(Paragraph(
    "Vertex Oncology intends to submit an IND application by Q4 2026. This RFP covers the full "
    "in vitro safety pharmacology and genotoxicity package required to support the IND submission "
    "under ICH S7A/S7B and ICH S2(R1) guidelines.",
    body_text
))
story.append(Paragraph(
    "<b>Test article supply:</b> Vertex Oncology will supply VOX-4471 as a lyophilised powder "
    "with a Certificate of Analysis (CoA). Purity is &gt;98% by HPLC. The CRO is responsible for "
    "formulation. GLP-grade vehicle (0.5% methylcellulose in PBS) is preferred unless the CRO can "
    "justify an alternative.",
    body_text
))

# ── 2. Scope of work ─────────────────────────────────────────────────────────
story.append(Paragraph("2. SCOPE OF WORK — REQUIRED ASSAYS", section_head))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY, spaceAfter=10))

assay_data = [
    [Paragraph("Assay", table_header), Paragraph("Guideline", table_header),
     Paragraph("System", table_header), Paragraph("Concentrations", table_header)],
    ["hERG channel inhibition (patch-clamp)",
     "ICH S7B", "HEK293 stably expressing hERG", "0.1, 1, 3, 10, 30 µM (n=3/conc)"],
    ["Nav1.5 (cardiac sodium channel)",
     "ICH S7A", "CHO-K1 stable cell line", "1, 10, 30 µM (n=3/conc)"],
    ["Cav1.2 (L-type calcium channel)",
     "ICH S7A", "HEK293 stable cell line", "1, 10, 30 µM (n=3/conc)"],
    ["Ames test (bacterial reverse mutation)",
     "ICH S2(R1)", "TA98, TA100, TA1535, TA1537, WP2uvrA", "5 concentrations ± S9"],
    ["In vitro micronucleus (MNvit)",
     "ICH S2(R1)", "TK6 human lymphoblastoid cells", "4 concentrations ± S9, 3h/24h treatment"],
    ["Cytotoxicity panel (MTT)",
     "Internal", "HepG2, HEK293, Jurkat", "8-point CRC, duplicate"],
    ["CYP inhibition (direct + TDI)",
     "FDA DDI guidance", "Human liver microsomes (pooled, n≥50)", "CYP1A2, 2C8, 2C9, 2C19, 2D6, 3A4 (MBI)"],
]
assay_table = Table(
    assay_data,
    colWidths=[2.0*inch, 1.2*inch, 1.8*inch, 1.5*inch],
    repeatRows=1
)
assay_table.setStyle(TableStyle([
    ("BACKGROUND",   (0,0), (-1,0), GREEN),
    ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE",     (0,0), (-1,-1), 8),
    ("TEXTCOLOR",    (0,1), (-1,-1), colors.HexColor("#374151")),
    ("ROWBACKGROUNDS",(0,1), (-1,-1), [colors.white, LIGHT_GRAY]),
    ("GRID",         (0,0), (-1,-1), 0.5, BORDER_GRAY),
    ("TOPPADDING",   (0,0), (-1,-1), 6),
    ("BOTTOMPADDING",(0,0), (-1,-1), 6),
    ("LEFTPADDING",  (0,0), (-1,-1), 6),
    ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("VALIGN",       (0,0), (-1,-1), "TOP"),
]))
story.append(assay_table)
story.append(Spacer(1, 8))
story.append(Paragraph(
    "Note: All electrophysiology assays must be conducted under GLP conditions. "
    "Genotoxicity studies must be GLP-compliant. CYP inhibition and cytotoxicity "
    "studies may be non-GLP but must follow validated SOPs.",
    note_text
))

# ── 3. Primary endpoints ─────────────────────────────────────────────────────
story.append(Paragraph("3. PRIMARY ENDPOINTS &amp; SUCCESS CRITERIA", section_head))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY, spaceAfter=10))

endpoints = [
    ("hERG IC<sub>50</sub> determination", "IC50 &gt; 30× the anticipated human Cmax (estimated 500 nM free plasma)"),
    ("Nav1.5 / Cav1.2 selectivity", "IC50 &gt; 30 µM for both channels"),
    ("Genotoxicity", "Negative result in both Ames and MNvit; positive control responses within historical range"),
    ("CYP inhibition", "IC50 &gt; 10 µM for all CYPs; TDI ratio &lt; 1.5× for all CYPs at clinically relevant concentrations"),
    ("Cytotoxicity", "CC50 reported for each cell line; selectivity index (&gt;10× over target cell IC50) confirmed"),
]
for name, desc in endpoints:
    story.append(Paragraph(f"• <b>{name}:</b> {desc}", bullet_text))
story.append(Spacer(1, 8))

# ── 4. Timeline ───────────────────────────────────────────────────────────────
story.append(Paragraph("4. PROPOSED TIMELINE", section_head))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY, spaceAfter=10))
story.append(Paragraph(
    "Vertex Oncology requires all draft reports delivered within <b>16 weeks</b> of study "
    "initiation. Final GLP-signed reports must be issued within 4 weeks of draft approval. "
    "The following milestone schedule is preferred:",
    body_text
))

timeline_data = [
    [Paragraph("Milestone", table_header), Paragraph("Target week", table_header)],
    ["Contract executed / study initiation",         "Week 0"],
    ["Protocol finalisation and Vertex approval",    "Week 2"],
    ["Test article receipt and QC confirmation",     "Week 3"],
    ["Electrophysiology studies complete",           "Week 8"],
    ["Genotoxicity studies complete",                "Week 10"],
    ["CYP inhibition and cytotoxicity complete",     "Week 12"],
    ["All draft reports to Vertex",                  "Week 16"],
    ["Final GLP reports issued",                     "Week 20"],
]
timeline_table = Table(timeline_data, colWidths=[4.5*inch, 1.5*inch], repeatRows=1)
timeline_table.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1,0), GREEN),
    ("FONTSIZE",      (0,0), (-1,-1), 9),
    ("TEXTCOLOR",     (0,1), (-1,-1), colors.HexColor("#374151")),
    ("ROWBACKGROUNDS",(0,1), (-1,-1), [colors.white, LIGHT_GRAY]),
    ("GRID",          (0,0), (-1,-1), 0.5, BORDER_GRAY),
    ("TOPPADDING",    (0,0), (-1,-1), 6),
    ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("LEFTPADDING",   (0,0), (-1,-1), 8),
    ("RIGHTPADDING",  (0,0), (-1,-1), 8),
    ("ALIGN",         (1,0), (1,-1), "CENTER"),
]))
story.append(timeline_table)
story.append(Spacer(1, 8))
story.append(Paragraph(
    "If the CRO cannot meet the 16-week draft report deadline, please propose an "
    "alternative timeline with a clear scientific justification.",
    note_text
))

# ── 5. Deliverables ───────────────────────────────────────────────────────────
story.append(Paragraph("5. DELIVERABLES", section_head))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY, spaceAfter=10))

deliverables = [
    "GLP-compliant final study reports for all GLP assays (electrophysiology, genotoxicity), signed by Study Director",
    "Non-GLP summary reports for CYP inhibition and cytotoxicity assays",
    "Raw data files in Excel format (Vertex template preferred — template available on request)",
    "Study protocols for Vertex approval prior to study initiation",
    "Interim data summary email at Week 8 (electrophysiology results)",
    "Electronic copies of all reports in PDF/A format",
    "Archival of all raw data for minimum 15 years post-study completion",
]
for d in deliverables:
    story.append(Paragraph(f"• {d}", bullet_text))
story.append(Spacer(1, 8))

# ── 6. Regulatory & compliance ────────────────────────────────────────────────
story.append(Paragraph("6. REGULATORY &amp; COMPLIANCE REQUIREMENTS", section_head))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY, spaceAfter=10))
story.append(Paragraph(
    "The CRO must hold current GLP certification from an internationally recognised regulatory "
    "authority (FDA, MHRA, PMDA, BfArM, or equivalent OECD member authority). GLP compliance "
    "statements must be included in all GLP study reports.",
    body_text
))
story.append(Paragraph(
    "Vertex Oncology reserves the right to conduct a remote or on-site audit of the CRO facility "
    "prior to study initiation. Please indicate in your proposal whether you have been audited by "
    "an OECD-member regulatory authority in the past 3 years and provide the outcome.",
    body_text
))

# ── 7. Proposal requirements ──────────────────────────────────────────────────
story.append(Paragraph("7. PROPOSAL REQUIREMENTS", section_head))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY, spaceAfter=10))
story.append(Paragraph("Proposals must include the following sections:", body_text))

proposal_reqs = [
    "Executive summary (maximum 1 page)",
    "Technical approach for each assay — including instrumentation, cell lines/strains sourced from, passage number policy, and positive/negative controls",
    "Team qualifications — CVs or brief bios of Study Director(s) and key personnel",
    "Facility overview — GLP certification status, relevant instrumentation, capacity",
    "Proposed study timeline with milestones",
    "Detailed budget broken down by assay (line-item pricing)",
    "Assumptions and exclusions — clearly state what is and is not included",
    "References — 2–3 examples of similar studies conducted in the past 2 years (redacted if confidential)",
]
for i, req in enumerate(proposal_reqs, 1):
    story.append(Paragraph(f"{i}. {req}", bullet_text))
story.append(Spacer(1, 8))

# ── 8. Special requirements ───────────────────────────────────────────────────
story.append(Paragraph("8. SPECIAL REQUIREMENTS &amp; NOTES", section_head))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY, spaceAfter=10))
story.append(Paragraph(
    "<b>Confidentiality:</b> All information in this RFP is proprietary and confidential to "
    "Vertex Oncology. Responding CROs must execute a mutual CDA before receiving any additional "
    "compound data. A template CDA is available on request.",
    body_text
))
story.append(Paragraph(
    "<b>Solubility:</b> VOX-4471 has limited aqueous solubility (approximately 12 µM in PBS at "
    "pH 7.4). CROs must have validated protocols for handling low-solubility compounds and should "
    "include a solubility assessment as part of the study initiation checklist.",
    body_text
))
story.append(Paragraph(
    "<b>Multiple CROs:</b> Vertex Oncology may split the package between more than one CRO. "
    "Please indicate if your organisation can deliver the complete package or only specific assays.",
    body_text
))
story.append(Paragraph(
    "<b>Budget constraint:</b> Vertex Oncology has a preferred budget envelope for the complete "
    "package. Please provide itemised pricing to allow flexible negotiation.",
    body_text
))

# ── 9. Submission instructions ────────────────────────────────────────────────
story.append(Paragraph("9. SUBMISSION INSTRUCTIONS", section_head))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY, spaceAfter=10))
story.append(Paragraph(
    "Proposals must be submitted by email to <b>s.chen@vertexoncology.com</b> with the subject "
    "line <b>\"RFP Response — VOX-4471 Safety Package — [CRO Name]\"</b> by <b>23:59 Pacific "
    "Time on April 18, 2026</b>. Late submissions will not be reviewed.",
    body_text
))
story.append(Paragraph(
    "Questions regarding this RFP may be submitted to the same address by April 11, 2026. "
    "Responses to questions will be circulated to all responding CROs.",
    body_text
))

# ── Footer note ───────────────────────────────────────────────────────────────
story.append(Spacer(1, 20))
story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY, spaceAfter=8))
story.append(Paragraph(
    "Vertex Oncology Inc. reserves the right to accept or reject any proposal without obligation "
    "to disclose the reasons for its decision. This RFP does not constitute a commitment to award "
    "a contract.",
    note_text
))

doc.build(story)
print(f"PDF generated: {os.path.abspath(OUTPUT_PATH)}")
