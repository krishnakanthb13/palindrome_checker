import datetime
import os

def is_valid_time(s):
    """Checks if a 6-digit string matches a valid HH:MM:SS format."""
    try:
        hh = int(s[0:2])
        mm = int(s[2:4])
        ss = int(s[4:6])
        return 0 <= hh < 24 and 0 <= mm < 60 and 0 <= ss < 60
    except (ValueError, IndexError):
        return False

def generate_dates():
    # Define the start and end dates for the 20th and 21st centuries
    start_date = datetime.date(1900, 1, 1)
    end_date = datetime.date(2099, 12, 31)
    
    # Target directory and file
    # This script is in century_dates/, so we go up one level to find data/
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, 'data')
    output_path = os.path.join(data_dir, 'century_dates.txt')
    
    # Ensure data directory exists (user said it is already present, but good practice)
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
    
    print(f"Generating dates from {start_date} to {end_date}...")
    print(f"Saving to: {output_path}")
    
    current_date = start_date
    count = 0
    with open(output_path, 'w') as f:
        while current_date <= end_date:
            # 1. YYMMDD (Unconditional as per initial request)
            yymmdd = current_date.strftime('%y%m%d')
            # 2. YYYYMMDD (Unconditional as per initial request)
            yyyymmdd = current_date.strftime('%Y%m%d')
            
            f.write(f"{yymmdd}\n")
            f.write(f"{yyyymmdd}\n")
            count += 2

            # 3. Check for YYMMDDHHMMSS palindrome
            # For YYMMDDHHMMSS to be a palindrome, HHMMSS must be reverse of YYMMDD
            hhmmss_candidate_6 = yymmdd[::-1]
            if is_valid_time(hhmmss_candidate_6):
                f.write(f"{yymmdd}{hhmmss_candidate_6}\n")
                count += 1
            
            # 4. Check for YYYYMMDDHHMMSS palindrome
            # Length 14: Y1 Y2 Y3 Y4 M1 M2 D1 D2 | H1 H2 M1 M2 S1 S2
            # Palindrome requires D1 == D2 and HHMMSS == reverse(YYYYMM[0:6])
            if yyyymmdd[6] == yyyymmdd[7]:
                hhmmss_candidate_8 = yyyymmdd[0:6][::-1]
                if is_valid_time(hhmmss_candidate_8):
                    f.write(f"{yyyymmdd}{hhmmss_candidate_8}\n")
                    count += 1
            
            current_date += datetime.timedelta(days=1)
            
    print(f"Done! Created {count} date entries.")

if __name__ == "__main__":
    generate_dates()
