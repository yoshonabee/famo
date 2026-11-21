import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, request, type Board, type BoardInput } from '@/lib/api'

export function useSaveBoard(board?: Pick<Board, 'id' | 'version'>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: BoardInput) =>
      board
        ? request<Board>(`/boards/${board.id}`, {
            ...input,
            version: board.version,
          })
        : request<Board>('/boards', input),
    onSuccess: async (saved) => {
      await client.cancelQueries({ queryKey: ['boards'] })
      client.setQueryData<Board[]>(['boards'], (previous = []) =>
        previous.some(({ id }) => id === saved.id)
          ? previous.map((item) =>
              item.id === saved.id && item.version <= saved.version
                ? saved
                : item,
            )
          : [...previous, saved],
      )
      void client.invalidateQueries({ queryKey: ['boards'] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        return client.invalidateQueries({ queryKey: ['boards'] })
    },
  })
}
