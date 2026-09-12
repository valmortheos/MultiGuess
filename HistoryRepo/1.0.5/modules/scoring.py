import math
import difflib

def levenshtein_distance(s1, s2):
    s1 = s1.lower().strip()
    s2 = s2.lower().strip()
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]

def similar_ratio(a, b):
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()

def is_similar_guess(guess, answer):
    guess = guess.lower().strip()
    answer = answer.lower().strip()

    if len(guess) < 3 or len(answer) < 3:
        return False

    if abs(len(guess) - len(answer)) > 2:
        return False

    dist = levenshtein_distance(guess, answer)
    ratio = similar_ratio(guess, answer)

    return dist <= 2 and ratio >= 0.7

def calculate_guesser_points(time_remaining, order):
    time_rem = max(0, time_remaining)
    base_points = min(100, math.floor(50 + (time_rem * 0.6)))
    points = math.floor(base_points * (0.8 ** (order - 1)))
    return max(10, points)

def calculate_drawer_points(correct_guessers_count):
    return 20 * correct_guessers_count
