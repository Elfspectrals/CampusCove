import { apiRequest } from './http'

export interface Friend {
  account_id: number
  display_name: string
  username: string
  status: 'online' | 'offline' | 'playing'
}

export interface PendingFriend {
  account_id: number
  display_name: string
  username: string
  incoming: boolean
}

type MessageResponse = { message: string }

export async function getFriends(): Promise<{ friends: Friend[] }> {
  return (await apiRequest('/friends', { errorMessage: 'Failed to load friends' })) as { friends: Friend[] }
}

export async function getPending(): Promise<{ pending: PendingFriend[] }> {
  return (await apiRequest('/friends/pending', { errorMessage: 'Failed to load pending' })) as {
    pending: PendingFriend[]
  }
}

export async function sendRequest(username: string, tag: number): Promise<MessageResponse> {
  return (await apiRequest('/friends/request', {
    method: 'POST',
    body: { username, tag },
    errorMessage: 'Failed to send request',
  })) as MessageResponse
}

export async function acceptRequest(accountId: number): Promise<MessageResponse> {
  return (await apiRequest(`/friends/accept/${accountId}`, {
    method: 'POST',
    errorMessage: 'Failed to accept',
  })) as MessageResponse
}

export async function blockUser(accountId: number): Promise<MessageResponse> {
  return (await apiRequest(`/friends/block/${accountId}`, {
    method: 'POST',
    errorMessage: 'Failed to block',
  })) as MessageResponse
}

export async function removeFriend(accountId: number): Promise<MessageResponse> {
  return (await apiRequest(`/friends/${accountId}`, {
    method: 'DELETE',
    errorMessage: 'Failed to remove',
  })) as MessageResponse
}
