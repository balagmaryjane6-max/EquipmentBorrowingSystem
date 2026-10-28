/**
 * SAMPLE_DATA — Fallback seed data when PHP API is unavailable
 */
const SAMPLE_DATA = {
  equipment: [
    {
      id: 'EQP-CMP-001', name: 'MacBook Pro M2 Max 16"', category: 'Computing', condition: 'Excellent',
      status: 'Available', serial_number: 'MBP-2024-99182', location: 'Main IT Cage - Shelf A1',
      description: 'Apple M2 Max 32GB RAM, 1TB SSD. Pre-loaded with developer and design suites. Includes MagSafe charger and sleeve.',
      image_url: 'assets/images/laptop.jpg', total_borrows: 14, total_units: 5, available_units: 5
    },
    {
      id: 'EQP-MED-002', name: 'Sony FX6 Cinema Camera System', category: 'Media & AV', condition: 'Excellent',
      status: 'Borrowed', serial_number: 'SNY-FX6-40291', location: 'Media Studio Vault - Locker 3',
      description: 'Full-frame 4K cinema camera with 16-35mm T3.1 G-Master cinema zoom lens, top handle with XLR inputs, and V-mount battery.',
      image_url: 'assets/images/camera.jpg', total_borrows: 22, total_units: 3, available_units: 0
    },
    {
      id: 'EQP-LAB-003', name: 'Rohde & Schwarz Digital Oscilloscope', category: 'Laboratory', condition: 'Good',
      status: 'Available', serial_number: 'RTP-6002-88', location: 'EE Lab Room 302 - Station 4',
      description: '4-Channel 1GHz Digital Phosphor Oscilloscope with passive probes, waveform generator, and serial bus decode.',
      image_url: 'assets/images/lab.jpg', total_borrows: 8, total_units: 4, available_units: 4
    },
    {
      id: 'EQP-ROB-004', name: 'Orion Industrial Survey Drone Kit', category: 'Robotics', condition: 'Excellent',
      status: 'Available', serial_number: 'DRN-ORN-7741', location: 'Robotics Lab - Flight Cabinet B',
      description: 'Dual thermal & 4K optical gimbal sensor payload, heavy-duty smart flight batteries, remote controller with ultra-bright display.',
      image_url: 'assets/images/drone.jpg', total_borrows: 19, total_units: 2, available_units: 2
    },
    {
      id: 'EQP-CMP-005', name: 'Dell Precision 5820 VR Workstation', category: 'Computing', condition: 'Good',
      status: 'Under Maintenance', serial_number: 'DEL-P5820-112', location: 'Engineering Hub - Lab 101',
      description: 'Intel Xeon W-2245, 64GB DDR4, NVIDIA RTX A5000 24GB GPU. Currently scheduled for thermal repasting and firmware upgrade.',
      image_url: 'assets/images/laptop.jpg', total_borrows: 31, total_units: 1, available_units: 0
    },
    {
      id: 'EQP-MED-006', name: 'Epson Pro EX9240 Wireless Projector', category: 'Media & AV', condition: 'Good',
      status: 'Borrowed', serial_number: 'EPS-9240-5582', location: 'AV Store - Shelf C2',
      description: '4,000 lumens color and white brightness, Full HD 1080p, HDMI/Miracast wireless streaming. Includes carry case and remote.',
      image_url: 'assets/images/camera.jpg', total_borrows: 45, total_units: 6, available_units: 0
    }
  ],
  requests: [
    {
      id: 'REQ-20261016A', equipment_id: 'EQP-MED-002', equipment_name: 'Sony FX6 Cinema Camera System',
      equipment_image: 'assets/images/camera.jpg', borrower_name: 'Carlos Rivera',
      borrower_email: 'crivera@student.edu', borrower_id_number: 'STU-2026-042',
      department: 'Film & Media Arts', contact_number: '+1 (555) 019-4421',
      borrow_date: new Date(Date.now() - 5*86400000).toISOString(),
      expected_return_date: new Date(Date.now() - 1*86400000).toISOString(),
      purpose: 'Senior thesis documentary — on-location interviews and B-roll capture.',
      status: 'Active', approved_by: 'Administrator', released_by: 'Equipment Custodian',
      released_at: new Date(Date.now() - 5*86400000).toISOString()
    },
    {
      id: 'REQ-20261018B', equipment_id: 'EQP-MED-006', equipment_name: 'Epson Pro EX9240 Wireless Projector',
      equipment_image: 'assets/images/camera.jpg', borrower_name: 'Aisha Patel',
      borrower_email: 'apatel@student.edu', borrower_id_number: 'STU-2026-077',
      department: 'Business Administration', contact_number: '+1 (555) 022-8831',
      borrow_date: new Date(Date.now() - 3*86400000).toISOString(),
      expected_return_date: new Date(Date.now() + 2*86400000).toISOString(),
      purpose: 'MBA capstone pitch presentation — Conference Room B.',
      status: 'Active', approved_by: 'Administrator', released_by: 'Equipment Custodian',
      released_at: new Date(Date.now() - 3*86400000).toISOString()
    },
    {
      id: 'REQ-20261020C', equipment_id: 'EQP-LAB-003', equipment_name: 'Rohde & Schwarz Digital Oscilloscope',
      equipment_image: 'assets/images/lab.jpg', borrower_name: 'James Chen',
      borrower_email: 'jchen@student.edu', borrower_id_number: 'STU-2026-031',
      department: 'Electrical Engineering', contact_number: '+1 (555) 018-3310',
      borrow_date: new Date().toISOString(),
      expected_return_date: new Date(Date.now() + 6*86400000).toISOString(),
      purpose: 'Signal analysis for final-year embedded systems project.',
      status: 'Pending'
    }
  ],
  returns: [
    {
      id: 'RET-20261010A', request_id: 'REQ-20261005X', equipment_id: 'EQP-CMP-001',
      equipment_name: 'MacBook Pro M2 Max 16"', borrower_name: 'Emma Watson',
      borrow_date: new Date(Date.now() - 15*86400000).toISOString(),
      expected_return_date: new Date(Date.now() - 8*86400000).toISOString(),
      actual_return_date: new Date(Date.now() - 7*86400000).toISOString(),
      is_overdue: 0, days_overdue: 0, condition_on_return: 'Excellent',
      custodian_notes: 'All accessories accounted for, charger and sleeve returned in original bag.',
      received_by: 'Equipment Custodian'
    },
    {
      id: 'RET-20261012B', request_id: 'REQ-20261002Y', equipment_id: 'EQP-ROB-004',
      equipment_name: 'Orion Industrial Survey Drone Kit', borrower_name: 'Lucas Kim',
      borrow_date: new Date(Date.now() - 20*86400000).toISOString(),
      expected_return_date: new Date(Date.now() - 12*86400000).toISOString(),
      actual_return_date: new Date(Date.now() - 10*86400000).toISOString(),
      is_overdue: 1, days_overdue: 2, condition_on_return: 'Good',
      custodian_notes: 'Minor scuff on landing gear. Batteries returned with 40% charge. All propellers intact.',
      received_by: 'Administrator'
    }
  ]
};
