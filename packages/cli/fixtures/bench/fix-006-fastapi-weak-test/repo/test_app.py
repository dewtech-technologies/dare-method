from app import divide

def test_divide_two_numbers():
    assert divide(10, 2) == 5.0

def test_divide_by_one():
    assert divide(4, 1) == 4.0
