def load_tasks():
    """tasks.txt からタスクを読み込み、タスクのリストを返す。
    ファイルが存在しない場合は空のリストを返す。
    """
    try:
        with open("tasks.txt", "r") as f:
            tasks = [line.strip() for line in f.readlines()]
        return tasks
    except FileNotFoundError:
        return []

def save_tasks(tasks):
    """タスクのリストを引数に取り、tasks.txt に各タスクを1行ずつ書き込む。
    """
    with open("tasks.txt", "w") as f:
        for task in tasks:
            f.write(task + "\n")

def add_task(tasks, new_task):
    """現在のタスクのリストと新しいタスクを引数に取り、
    新しいタスクをリストに追加して更新されたリストを返す。
    """
    tasks.append(new_task)
    return tasks

def display_tasks(tasks):
    """タスクのリストを引数に取り、タスクを番号付きで表示する。
    タスクが空の場合は「タスクはありません。」と表示する。
    """
    if not tasks:
        print("タスクはありません。")
    else:
        for i, task in enumerate(tasks, 1):
            print(f"{i}. {task}")

def delete_task(tasks, task_index):
    """現在のタスクのリストと削除したいタスクのインデックスを引数に取り、
    該当するタスクをリストから削除し、成功したかどうかと更新されたリストを返す。
    """
    if 0 <= task_index < len(tasks):
        tasks.pop(task_index)
        return True, tasks
    else:
        return False, tasks

def main():
    while True:
        print("\nTODOアプリ")
        print("1: 追加")
        print("2: 一覧表示")
        print("3: 削除")
        print("4: 終了")
        choice = input("選択してください: ")

        if choice == '1':
            new_task = input("新しいタスクを入力してください: ")
            tasks = load_tasks()
            tasks = add_task(tasks, new_task)
            save_tasks(tasks)
            print("タスクを追加しました。")
        elif choice == '2':
            tasks = load_tasks()
            display_tasks(tasks)
        elif choice == '3':
            tasks = load_tasks()
            display_tasks(tasks)
            if not tasks:
                print("削除できるタスクがありません。")
                continue
            try:
                task_num_str = input("削除したいタスクの番号を入力してください: ")
                task_index = int(task_num_str) - 1
                success, tasks = delete_task(tasks, task_index)
                if success:
                    save_tasks(tasks)
                    print("タスクを削除しました。")
                else:
                    print("無効な番号です。")
            except ValueError:
                print("無効な入力です。番号で入力してください。")
        elif choice == '4':
            print("アプリを終了します。")
            break
        else:
            print("無効な選択です。もう一度入力してください。")

if __name__ == "__main__":
    main()
