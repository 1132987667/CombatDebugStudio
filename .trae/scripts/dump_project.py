#!/usr/bin/env python3
"""
dump_project.py - 抽取项目文件夹架构和所有文件内容。
支持忽略规则（类似 .gitignore）。
"""

import os
import sys
import argparse
import fnmatch
from pathlib import Path

# 尝试导入 pathspec（推荐，但非必需）
try:
    from pathspec import PathSpec
    from pathspec.patterns import GitWildMatchPattern
    HAS_PATHSPEC = True
except ImportError:
    HAS_PATHSPEC = False


class SimpleIgnoreMatcher:
    """简单的忽略规则匹配器（不支持 ** 和否定模式）"""

    def __init__(self, lines):
        self.patterns = []  # 每个元素为 (pattern, dir_only)
        for line in lines:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if line.startswith('!'):
                # 忽略否定模式（简单版本不支持）
                continue
            dir_only = line.endswith('/')
            if dir_only:
                line = line[:-1]
            self.patterns.append((line, dir_only))

    def match(self, rel_path, is_dir=False):
        """
        rel_path: 相对于根目录的路径（使用正斜杠）
        is_dir  : 是否为目录
        返回 True 表示应忽略
        """
        for pattern, dir_only in self.patterns:
            if dir_only and not is_dir:
                continue
            # 处理以 / 开头的模式（锚定到根目录）
            if pattern.startswith('/'):
                p = pattern[1:]
                if fnmatch.fnmatch(rel_path, p):
                    return True
            elif '/' in pattern:
                # 模式包含 /，匹配完整路径
                if fnmatch.fnmatch(rel_path, pattern):
                    return True
            else:
                # 模式不含 /，仅匹配文件名部分
                basename = os.path.basename(rel_path)
                if fnmatch.fnmatch(basename, pattern):
                    return True
        return False


def load_ignore_matcher(ignore_file):
    """加载忽略规则，返回匹配器对象"""
    if not os.path.isfile(ignore_file):
        return None
    with open(ignore_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    if HAS_PATHSPEC:
        # 使用 pathspec 库精确解析 gitignore 规则
        return PathSpec.from_lines(GitWildMatchPattern, lines)
    else:
        return SimpleIgnoreMatcher(lines)


def should_ignore(matcher, rel_path, is_dir=False):
    """判断相对路径是否应忽略"""
    if matcher is None:
        return False
    if HAS_PATHSPEC:
        # pathspec 需要为目录添加尾部斜杠，以便匹配以 '/' 结尾的模式
        match_path = rel_path + '/' if is_dir else rel_path
        return matcher.match_file(match_path)
    else:
        return matcher.match(rel_path, is_dir)


def build_tree(root_path, rel_path, matcher, follow_links, file_paths):
    """
    递归构建目录树，并收集所有应包含的文件路径。
    返回树节点列表，每个节点为 (type, name, [children])。
    """
    full_path = os.path.join(root_path, rel_path) if rel_path else root_path
    entries = []
    try:
        with os.scandir(full_path) as it:
            for entry in it:
                name = entry.name
                if rel_path:
                    rel_entry = os.path.join(rel_path, name).replace(os.sep, '/')
                else:
                    rel_entry = name

                if entry.is_dir(follow_symlinks=follow_links):
                    if should_ignore(matcher, rel_entry, is_dir=True):
                        continue
                    sub_tree = build_tree(root_path, rel_entry, matcher,
                                          follow_links, file_paths)
                    entries.append(('dir', name, sub_tree))
                else:
                    if should_ignore(matcher, rel_entry, is_dir=False):
                        continue
                    entries.append(('file', name))
                    file_paths.append(rel_entry)
    except PermissionError:
        entries.append(('error', '权限不足无法访问', None))
    except OSError as e:
        entries.append(('error', f'访问错误: {e}', None))

    # 排序：目录在前，文件在后，均按名称不区分大小写排序
    entries.sort(key=lambda x: (x[0] != 'dir', x[1].lower()))
    return entries


def generate_tree(start_path, matcher, follow_links=False):
    """生成树形文本行列表和文件相对路径列表"""
    start_path = os.path.abspath(start_path)
    root_name = os.path.basename(start_path) or start_path

    file_paths = []
    tree_data = build_tree(start_path, '', matcher, follow_links, file_paths)

    # 将树数据转换为文本行
    tree_lines = []

    def _print_tree(data, indent=''):
        for entry in data:
            if entry[0] == 'dir':
                tree_lines.append(f"{indent}{entry[1]}/")
                _print_tree(entry[2], indent + '    ')
            elif entry[0] == 'file':
                tree_lines.append(f"{indent}{entry[1]}")
            else:
                tree_lines.append(f"{indent}<{entry[1]}>")

    _print_tree(tree_data)
    tree_lines.insert(0, f"{root_name}/")
    return tree_lines, file_paths


def read_file_content(rel_path, root):
    """尝试以 UTF-8 读取文件内容，失败时返回 None 表示二进制文件"""
    full_path = os.path.join(root, rel_path)
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            return f.read()
    except UnicodeDecodeError:
        return None
    except Exception as e:
        return f"<读取文件时出错: {e}>"


def main():
    parser = argparse.ArgumentParser(
        description="抽取项目文件夹架构和文件内容（支持忽略规则）")
    parser.add_argument('path', nargs='?', default='.',
                        help="项目根目录 (默认当前目录)")
    parser.add_argument('-o', '--output', help="输出文件路径 (默认输出到控制台)")
    parser.add_argument('-i', '--ignore-file',
                        help="忽略文件路径 (默认在根目录下查找 .gitignore)")
    parser.add_argument('--no-ignore', action='store_true',
                        help="不使用任何忽略文件")
    parser.add_argument('--follow-links', action='store_true',
                        help="跟随符号链接")
    args = parser.parse_args()

    root = os.path.abspath(args.path)
    if not os.path.isdir(root):
        print(f"错误: {root} 不是有效的目录", file=sys.stderr)
        sys.exit(1)

    matcher = None
    if not args.no_ignore:
        ignore_file = args.ignore_file
        if ignore_file is None:
            # 默认查找根目录下的 .gitignore
            gitignore = os.path.join(root, '.gitignore')
            if os.path.isfile(gitignore):
                ignore_file = gitignore
        if ignore_file and os.path.isfile(ignore_file):
            matcher = load_ignore_matcher(ignore_file)
            if matcher is None:
                print(f"警告: 忽略文件 {ignore_file} 为空或无法加载",
                      file=sys.stderr)
        elif ignore_file:
            print(f"警告: 忽略文件 {ignore_file} 不存在", file=sys.stderr)

    if not HAS_PATHSPEC and matcher is not None:
        print("提示: 未安装 pathspec 库，将使用内置简单匹配器（不支持 ** 和否定模式）",
              file=sys.stderr)

    print(f"正在处理目录: {root}", file=sys.stderr)

    tree_lines, file_paths = generate_tree(root, matcher, args.follow_links)

    # 构建输出内容
    output_lines = []
    output_lines.append("项目文件夹架构:")
    output_lines.extend(tree_lines)
    output_lines.append("\n" + "=" * 60)
    output_lines.append("文件内容:")
    output_lines.append("")

    for rel_path in file_paths:
        output_lines.append(f"--- {rel_path} ---")
        content = read_file_content(rel_path, root)
        if content is None:
            output_lines.append("<二进制文件，内容未显示>")
        else:
            output_lines.append(content.rstrip())
        output_lines.append("")  # 空行分隔

    output_text = "\n".join(output_lines)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output_text)
        print(f"输出已写入 {args.output}", file=sys.stderr)
    else:
        print(output_text)


if __name__ == '__main__':
    main()