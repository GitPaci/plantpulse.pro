Emotional thesis
Feels like a calm pharma control room: steady, readable, and accountable—without drama.
Visual hierarchy rules
	•	Operator wallboard is sacred:
	◦	occupancy bars first
	◦	tasks second
	◦	shift band present but secondary
	•	Planning tools never appear in Operator lens.
Typography
	•	Industrial sans-serif, high legibility
	•	Use tabular numerals if available
	•	Hierarchy:
	◦	H1 30px/600
	◦	H2 20px/600
	◦	H3 16px/600
	◦	Body 14px/400
	◦	Caption 12px/400
	•	Line-height ≥ 1.5
	•	Never rely on tiny text for critical state
Color system
	•	Neutral UI base
	•	Batch colors = tracking only
	•	Semantic state uses label + icon
	•	Tasks:
	◦	planned = red
	◦	done = green + ✓
	•	Warnings:
	◦	amber + icon + label
	•	Critical:
	◦	explicit “CRITICAL” chip + required comment
Shift band design
	•	Always visible at top
	•	4 team colors
	•	Clearly segmented by 12h blocks
	•	Must be readable but not overpower bars
	•	Current shift label near now-line
Shutdown block design
	•	Full-width across all machines
	•	Clear text: “PLANT SHUTDOWN (NO ELECTRICITY)”
	•	Operator: read-only
	•	Planner/Maintenance: editable in draft/layer
	•	Visually unmistakable boundary in timeline
Interaction design
	•	One-click confirmation for tasks and maintenance acknowledgements
	•	Long-press opens:
	◦	comment
	◦	not possible
	•	Undo is first-class (toast with undo)
	•	Planner interactions:
	◦	drag/move/stretch with ghost preview
	◦	snapping to grid (hour by default)
	◦	clear conflict highlight when violating rules
Copy tone
	•	Calm, neutral, precise
	•	Examples:
	◦	“Draft proposed. Awaiting planner approval.”
	◦	“Critical change: comment required.”
	◦	“Shutdown boundary crossed. Override required.”
	◦	“Maintenance task marked not possible. Add reason.”
Accessibility
	•	WCAG AA minimum contrast
	•	Keyboard navigation in Planner and Admin
	•	Focus rings visible
	•	Never color-only meaning
Compliance surfaces (Enterprise)
From the GxP guidance: focus on audit trails, IAM, retention, and change control.
	•	Make draft vs committed obvious
	•	Make commit + critical flags obvious
	•	Make comment requirement unavoidable (not a weak modal)
Design snapshot

Core rule: Operator = calm instrument panel. Planner = controlled editor.
Shift band: ownership layer. Not decoration.
Shutdown: full-width boundary block.
