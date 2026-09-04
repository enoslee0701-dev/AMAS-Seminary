#!/usr/bin/env bash
#
# 从 git 历史中彻底移除与项目无关的大文件（约 31 MB）。
#
# 为什么需要你手动运行：git filter-branch 会重写**已经推送过**的提交，
# 之后必须 force-push。这属于不可逆操作，Claude Code 的权限门禁不允许
# AI 直接执行 —— 这是对的，这种事应该由人按下回车。
#
# 运行方式（在 Git Bash 里）：
#   cd "/c/Users/enosl/Desktop/AMAS Seminar App"
#   bash scripts/purge-large-history.sh
#
# 出问题怎么回滚：完整的 .git 备份在
#   .git-backup-before-history-rewrite/
# 把它改名回 .git 即可完全恢复到重写之前。

set -euo pipefail

TARGETS=(
  "migrated_prompt_history"
  "aa777956-a567-4b53-a1c6-1bc7ad78e71a.png"
  "sec2-report.txt"
)

echo "════════════════════════════════════════════"
echo "  从 git 历史中移除大文件"
echo "════════════════════════════════════════════"
echo

# ---- 前置检查 ----------------------------------------------------------
if [ ! -d .git ]; then
  echo "✗ 当前目录不是 git 仓库根。请先 cd 到项目目录。"
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "✗ 工作区有未提交的改动，请先提交或暂存后再运行。"
  git status --short
  exit 1
fi

if [ ! -d .git-backup-before-history-rewrite ]; then
  echo "! 没找到 .git 备份，正在创建…"
  cp -r .git .git-backup-before-history-rewrite
  echo "  备份完成：.git-backup-before-history-rewrite/"
fi

echo "重写前："
echo "  .git 体积   $(du -sh .git | cut -f1)"
echo "  main        $(git rev-parse --short main)"
echo "  远端 main   $(git rev-parse --short origin/main 2>/dev/null || echo '未知')"
echo
echo "将从**全部分支的全部历史**中移除："
for t in "${TARGETS[@]}"; do echo "    $t"; done
echo
echo "注意：所有提交哈希都会改变，之后必须 force-push。"
echo "      这些文件仍留在你的本地磁盘上，不会被删除。"
echo
read -r -p "确认执行？输入 yes 继续：" ans
[ "$ans" = "yes" ] || { echo "已取消，仓库未做任何改动。"; exit 0; }

# ---- 重写 --------------------------------------------------------------
echo
echo "→ 1/3 重写历史（大仓库可能要几分钟）…"
export FILTER_BRANCH_SQUELCH_WARNING=1
git filter-branch --force --index-filter \
  "git rm -r --cached --ignore-unmatch --quiet ${TARGETS[*]@Q}" \
  --prune-empty --tag-name-filter cat -- --all

echo
echo "→ 2/3 清理旧对象…"
rm -rf .git/refs/original
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo
echo "→ 3/3 结果"
echo "  .git 体积   $(du -sh .git | cut -f1)"
echo "  main        $(git rev-parse --short main)"
echo
# 校验：当前工作树内容必须与重写前完全一致
echo "  工作区状态： $(git status --porcelain --untracked-files=no | wc -l) 处差异（应为 0）"
echo

echo "════════════════════════════════════════════"
echo "  历史已重写。最后一步需要你自己执行："
echo
echo "    git push origin main --force"
echo
echo "  推送前建议先跑一遍验证："
echo "    npm test && npx tsc --noEmit"
echo
echo "  确认无误后，可以删掉备份："
echo "    rm -rf .git-backup-before-history-rewrite"
echo "════════════════════════════════════════════"
